import csv
import importlib.util
import json
from pathlib import Path
import tempfile
import types
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('atlas_crawl',Path(__file__).resolve().parents[1]/'scripts/crawl.py')
crawl=importlib.util.module_from_spec(spec); spec.loader.exec_module(crawl)

class ExtractionTests(unittest.TestCase):
    def test_source_labels_and_context_skip_hidden_media(self):
        # Replayed pattern: a case-study card's visible headline was surrounded
        # by CSS in saved newsroom link labels. Do not remove visible prose.
        source = 'https://example.com/news'
        parser = crawl.PageParser(source)
        parser.feed("""<article>
          <h2><a href="/study"><style>.card{width:100px}</style>
          <span>Customer case study</span><script>const hidden = "US$90 million";</script></a></h2>
          <p><style>.copy{color:red}</style>Issuer raised US$8 million.</p>
          <a href="/label" aria-label="Accessible source"><style>.icon{opacity:0}</style></a>
          <a href="/math">x &lt; y { width:100px }</a>
          <a href="/hidden"><script>const hiddenOnly = 1;</script></a>
          <script type="application/ld+json">{"@type":"Article","headline":"Structured headline"}</script>
          </article>""")
        by_url = {row['url']: row for row in parser.links}
        self.assertEqual(parser.headings, [{'level': 'h2', 'text': 'Customer case study'}])
        self.assertEqual(by_url['https://example.com/study'], {
            'url': 'https://example.com/study', 'text': 'Customer case study',
            'context': 'Issuer raised US$8 million.',
        })
        self.assertEqual(by_url['https://example.com/label']['text'], 'Accessible source')
        self.assertEqual(by_url['https://example.com/math']['text'], 'x < y { width:100px }')
        self.assertNotIn('https://example.com/hidden', by_url)
        self.assertIn('Issuer raised US$8 million.', parser.text)
        self.assertFalse(any('US$90 million' in text for text in parser.text))
        self.assertEqual(parser.structured, [{'@type': 'Article', 'headline': 'Structured headline'}])

    def test_page_fetch_coverage_distinguishes_empty_success_from_total_failure(self):
        success=crawl.page_fetch_coverage([{'pages':[{'status':'ok'}]}],[])
        failure=crawl.page_fetch_coverage([{'pages':[{'status':'skipped','reason':'DNS failure'}]}],[])
        self.assertEqual(success['fetch_status'],'all_succeeded')
        self.assertEqual(failure['fetch_status'],'none_succeeded')
        self.assertEqual(failure['pages_skipped_or_failed'],1)
        self.assertEqual(success['unreviewed_candidates'],0)
        self.assertEqual(failure['unreviewed_candidates'],0)

    def test_page_fetch_coverage_preserves_partial_and_unattempted_states(self):
        partial=crawl.page_fetch_coverage([{'pages':[{'status':'ok'},{'status':'skipped'}]}, {'pages':[{}]}],[{'review_required':True}])
        self.assertEqual(partial['fetch_status'],'partial')
        self.assertEqual(partial['sources_attempted'],2)
        self.assertEqual(partial['pages_attempted'],3)
        self.assertEqual(partial['pages_succeeded'],1)
        self.assertEqual(partial['pages_skipped_or_failed'],2)
        self.assertEqual(partial['unreviewed_candidates'],1)
        self.assertEqual(crawl.page_fetch_coverage([],[])['fetch_status'],'not_attempted')

    def test_profile_media_candidates_preserve_sources_and_require_review(self):
        page={'final_url':'https://example.com/team','checked_at':'2026-11-13', **crawl.extract_page(b'<img alt="Ada Example" src="/ada.jpg"><a href="https://www.linkedin.com/in/ada">LinkedIn</a>', 'https://example.com/team')}
        candidates=crawl.extract_profile_media_leads('Example',page,'people')
        self.assertEqual({x['kind'] for x in candidates},{'image','social'})
        self.assertTrue(all(x['source_url']=='https://example.com/team' and x['review_required'] for x in candidates))
    def test_social_resource_hint_never_masks_labelled_anchor(self):
        # Crawl #46 included a YouTube JPEG preload as a social candidate.
        # A same-URL hint can also come before a genuine labelled anchor.
        source='https://www.joinef.com/'
        thumbnail='https://img.youtube.com/vi/B_cm9tcJldo/maxresdefault.jpg'
        channel='https://www.youtube.com/@Join_ef'
        hint=f'<link rel="preload" as="fetch" href="{channel}">'
        link=f'<a href="{channel}" aria-label="YouTube"></a>'
        prefix=f'<link rel="preload" as="image" href="{thumbnail}">'
        prefix+='<a href="https://youtube.com.example.org/@Join_ef">Lookalike</a>'
        for dom in (hint+link,link+hint):
            with self.subTest(dom=dom):
                page={'final_url':source,'checked_at':'2026-11-23',
                      **crawl.extract_page((prefix+dom+link).encode(),source)}
                self.assertIn(thumbnail,[r['url'] for r in page['links']])
                rows=crawl.extract_profile_media_leads('Entrepreneur First',page,'homepage')
                self.assertEqual([(r['candidate_url'],r['name']) for r in rows],[(channel,'YouTube')])
                self.assertTrue(rows[0]['review_required'])
        page={'final_url':source,'checked_at':'2026-11-23',
              **crawl.extract_page((prefix+hint).encode(),source)}
        self.assertEqual(crawl.extract_profile_media_leads('Entrepreneur First',page,'homepage'),[])
        self.assertEqual(crawl.extract_profile_media_leads(
            'Entrepreneur First',{k:v for k,v in page.items() if k!='profile_social_links'},'homepage'),[])

    def test_team_image_reused_alt_is_review_evidence_not_identity(self):
        # FloodMapp /our-team reuses "Peter" beside several different named
        # staff cards. Preserve the label and URLs, without promoting either
        # role or portrait. A nearby, uniquely labelled image is unchanged.
        source='https://example.com/our-team'
        html=b'''<div><img alt="Peter" src="/juliette.webp"><p>Juliette Murphy</p></div>
        <div><img alt=" peter " src="/ryan.webp"><p>Ryan Prosser</p></div>
        <div><img alt="Ada Example" src="/ada.webp"><p>Ada Example</p></div>
        <img alt="Ada Example" src="/ada.webp?size=large">
        <img alt="Ada Example" src="/ada.webp">
        <template><img alt="Ada Example" src="/inactive.webp"></template>'''
        page={'final_url':source,'checked_at':'2026-11-22',**crawl.extract_page(html,source)}
        rows=crawl.extract_profile_media_leads('Example',page,'people')
        self.assertEqual([row['name'] for row in rows],['Peter',' peter ','Ada Example','Ada Example'])
        self.assertEqual([row.get('label_distinct_image_paths') for row in rows],[2,2,None,None])
        self.assertTrue(all(row['kind']=='image' and row['review_required'] for row in rows))
        self.assertEqual(list(crawl.professional_bio_observations(
            {'name':'Example','founders':[{'name':'Juliette Murphy'},{'name':'Ryan Prosser'}]},
            page,set())),[])

    def test_profile_media_dedupes_identical_image_leads_before_cap(self):
        first = {'url': 'https://example.com/ada.jpg?size=large', 'alt': 'Ada Example'}
        different_caption = {**first, 'alt': 'Different source caption'}
        different_size = {**first, 'url': 'https://example.com/ada.jpg?size=small'}
        page = {'final_url': 'https://example.com/team', 'checked_at': '2026-11-21',
                'image_candidates': [first] * 100 + [different_caption, different_size],
                'links': [{'url': 'https://www.linkedin.com/in/ada', 'text': 'LinkedIn'}]}
        rows = crawl.extract_profile_media_leads('Example', page, 'people')
        self.assertEqual([(row['kind'], row['candidate_url'], row['name']) for row in rows], [
            ('image', first['url'], first['alt']),
            ('image', different_caption['url'], different_caption['alt']),
            ('image', different_size['url'], different_size['alt']),
            ('social', 'https://www.linkedin.com/in/ada', 'LinkedIn'),
        ])
        other_page = {**page, 'final_url': 'https://example.com/about'}
        other_rows = crawl.extract_profile_media_leads('Example', other_page, 'about')
        self.assertEqual([row['source_url'] for row in other_rows], [other_page['final_url']] * 4)
        self.assertTrue(all(row['review_required'] for row in rows + other_rows))
        distinct_images = [{'url': f'https://example.com/{i}.png'} for i in range(101)]
        many_rows = crawl.extract_profile_media_leads('Example', {**page, 'image_candidates': distinct_images}, 'people')
        self.assertEqual(len(many_rows), 101)
        self.assertEqual(many_rows[99]['candidate_url'], distinct_images[99]['url'])
        self.assertEqual(many_rows[100]['kind'], 'social')

    def test_directory_coverage_counts_unmatched_and_failed_without_claiming_completeness(self):
        pages=[{'name':'Source','pages':[{'status':'ok','final_url':'https://example.com/'},{'status':'skipped'}]}]
        candidates=[{'source_name':'Source','existing_lead_exact':True},{'source_name':'Source','existing_lead_exact':False}]
        report=crawl.directory_coverage(pages,candidates,[],1)
        self.assertTrue(report['truncated'])
        self.assertEqual(report['sources'][0]['unmatched_names'],1)
        self.assertEqual(report['sources'][0]['pages_skipped_or_failed'],1)
        self.assertEqual(report['returned_candidates'],1)
    def test_request_url_encodes_spaces_without_double_encoding_or_losing_query(self):
        self.assertEqual(crawl.normalize_request_url('https://example.com/artesian logos/a%20b.png?q=one two&x=1'), 'https://example.com/artesian%20logos/a%20b.png?q=one%20two&x=1')
        with self.assertRaises(crawl.CrawlError):
            crawl.normalize_request_url('https://example.com/bad\npath')
    def test_captured_logo_resolution_is_reported_without_decoding(self):
        png=b'\x89PNG\r\n\x1a\n'+b'\x00\x00\x00\rIHDR'+(32).to_bytes(4,'big')+(32).to_bytes(4,'big')
        self.assertEqual(crawl.logo_resolution(png,'png'),{'width':32,'height':32,'quality':'small raster'})
        self.assertEqual(crawl.logo_resolution(b'<svg/>','svg'),{'quality':'vector'})
        self.assertEqual(crawl.logo_resolution(b'bad','png'),{'quality':'unknown'})
    def test_partner_update_candidates_require_matching_approved_identity_and_success(self):
        approved=[{'name':'Example','url':'https://example.com/'}]
        page={'status':'ok','url':'https://example.com/','final_url':'https://example.com/','checked_at':'2026-01-01','metadata':{'description':'  Venture capital  for founders. '}}
        snapshot={'mode':'logos','results':[{'name':'Example','url':'https://example.com/','pages':[page]},{'name':'Other','url':'https://example.com/','pages':[page]}]}
        candidates=crawl.partner_update_candidates(snapshot,approved)['candidates']
        self.assertEqual(len(candidates),1)
        self.assertTrue(candidates[0]['review_required'])
        self.assertEqual(candidates[0]['suggested_record']['description'],'Venture capital for founders.')
        self.assertNotIn('reviewed_at',candidates[0]['suggested_record'])
        page['status']='skipped'
        self.assertEqual(crawl.partner_update_candidates(snapshot,approved)['candidates'],[])
    def test_lazy_logo_variants_icons_and_metadata_are_candidates(self):
        source=b'''<head><meta itemprop="logo" content="/meta.svg"><link rel="apple-touch-icon" href="/touch.png"></head><body><img class="brandLogo" data-src="/lazy.svg" src="data:image/gif;base64,R0lG" data-srcset="/small.svg 1x, https://cdn.example.com/large.svg 2x"><img alt="company logo" srcset="data:image/png;base64,AAAA 1x, /invalid.png 2x"></body>'''
        rows=crawl.extract_page(source,'https://example.com/')['logo_candidates']
        urls={row['url']:row for row in rows}
        self.assertEqual(set(urls),{'https://example.com/lazy.svg','https://example.com/small.svg','https://cdn.example.com/large.svg','https://example.com/touch.png','https://example.com/meta.svg'})
        self.assertEqual(urls['https://example.com/touch.png']['kind'],'site-icon')
        self.assertEqual(urls['https://example.com/meta.svg']['kind'],'metadata-logo')
        self.assertFalse(urls['https://cdn.example.com/large.svg']['same_host'])
        self.assertTrue(all(row['review_required'] for row in rows))
    def test_brand_candidates_precede_portfolio_and_preserve_evidence(self):
        portfolio=''.join('<img class="portfolio-logo" src="/portfolio-%s.png">' % n for n in range(60))
        html=('<html><body>'+portfolio+'<header><a href="/"><img alt="Example logo" src="/brand.svg"></a></header><link rel="icon" href="/icon.png"></body></html>').encode()
        rows=crawl.extract_page(html,'https://example.com/')['logo_candidates']
        self.assertEqual(rows[0]['url'],'https://example.com/brand.svg')
        self.assertTrue(rows[0]['evidence']['home_link'])
        self.assertTrue(rows[0]['evidence']['in_header_or_nav'])
        self.assertEqual(rows[1]['url'],'https://example.com/icon.png')
        self.assertTrue(any('portfolio-' in row['url'] for row in rows))
        self.assertTrue(all(row['review_required'] for row in rows))
    def test_footer_logo_is_staged_before_icons_but_remains_unreviewed(self):
        html=b'<img class="portfolio-logo" src="/portfolio.svg"><link rel="icon" href="/icon.png"><footer><img class="logo" src="/footer-logo.svg"></footer>'
        rows=crawl.extract_page(html,'https://example.com/')['logo_candidates']
        self.assertEqual([row['url'].rsplit('/',1)[-1] for row in rows],['footer-logo.svg','icon.png','portfolio.svg'])
        self.assertTrue(rows[0]['evidence']['in_footer'])
        self.assertTrue(all(row['review_required'] for row in rows))

    def test_unrelated_external_home_link_does_not_increase_priority(self):
        html=b'<a href="https://other.example/"><img class="logo" src="/other.svg"></a><link rel="icon" href="/own.png">'
        rows=crawl.extract_page(html,'https://example.com/')['logo_candidates']
        self.assertEqual(rows[0]['kind'],'site-icon')
        self.assertFalse(rows[1]['evidence']['home_link'])

    def test_directory_table_cells_exclude_nested_tables_and_hidden_text(self):
        source=b'''<table><tr><th>Partner</th><th>Type</th></tr><tr><td><a href="https://example.org">Example <b>Ventures</b></a><script>hidden</script><table><tr><td>nested</td></tr></table></td><td>Venture Capital</td></tr></table>'''
        rows=crawl.extract_page(source,'https://example.com/')['tables'][0]['rows']
        self.assertEqual(rows[1][0]['text'],'Example Ventures')
        self.assertEqual(rows[1][0]['links'],['https://example.org'])
        self.assertEqual(rows[1][1]['text'],'Venture Capital')
    def test_logo_candidates_retain_provenance_and_do_not_assume_social_art_is_a_logo(self):
        source=b'''<html><head><link rel="icon" href="/favicon.png"><meta property="og:image" content="https://cdn.example.com/social.png"><script type="application/ld+json">{"@type":"Organization","name":"Example","logo":{"url":"/brand.svg"}}</script></head><body><img class="site-logo" src="/logo.png" alt="Example logo"></body></html>'''
        rows=crawl.extract_page(source,'https://example.com/')['logo_candidates']
        self.assertEqual([row['kind'] for row in rows],['structured-logo','site-icon','page-logo-image','social-image'])
        self.assertTrue(all(row['review_required'] and row['source']=='https://example.com/' for row in rows))
        self.assertFalse(rows[-1]['same_host'])
    def test_page_metadata_jsonld_and_bounded_same_host_follow(self):
        source=b'''<html lang="en"><head><title>Startup Program</title><meta name="description" content="Cloud credits"><meta property="og:image" content="https://example.com/logo.png"><link rel="icon" href="/favicon.svg"><script type="application/ld+json">{"@type":"Organization","name":"Example","foundingDate":"2020","url":"https://example.com/"}</script><script>alert('not visible')</script></head><body><h1>Credits for startups</h1><p>Eligibility requires a product.</p><a href="/apply">Apply now</a><a href="https://other.test/apply">Apply elsewhere</a></body></html>'''
        got=crawl.extract_page(source,'https://example.com/program')
        self.assertEqual(got['title'],'Startup Program')
        self.assertEqual(got['metadata']['description'],'Cloud credits')
        self.assertEqual(got['structured_data'][0]['foundingDate'],'2020')
        self.assertTrue(any('Eligibility' in x for x in got['signals']))
        self.assertFalse(any('not visible' in x for x in got['signals']))
        self.assertEqual(crawl.follow_links(got,'https://example.com/program',2),['https://example.com/apply'])
        self.assertEqual(crawl.follow_links(got,'https://example.com/program',0),[])
    def test_nested_program_links_and_categorised_evidence(self):
        source=b'''<li><a href="/startup-accelerator"><h3>Frontier Accelerator</h3></a><p>Up to $20,000 in credits for seed startups.</p><p>Applications close 2026-12-01.</p><p>A matching cash contribution is required.</p></li>'''
        got=crawl.extract_page(source,'https://example.com/programs')
        link=next(x for x in got['links'] if x.get('url')=='https://example.com/startup-accelerator')
        self.assertEqual(link['text'],'Frontier Accelerator')
        self.assertIn('seed startups',link['context'])
        self.assertIn('benefits',got['evidence'])
        self.assertIn('duration_and_deadlines',got['evidence'])
        self.assertIn('equity_and_cost',got['evidence'])
        self.assertTrue(all(item['source']=='https://example.com/programs' for rows in got['evidence'].values() for item in rows))
    def test_supplied_excerpts_are_explicitly_marked_as_partial(self):
        result=crawl.process_text_captures({'documents':[{'name':'Example','url':'https://example.com/program','acquisition':'search excerpt','text':'L5: Up to $5,000 in startup credits.\nL6: Credits expire in 12 months.'}]})
        row=result['results'][0]
        self.assertEqual(row['status'],'provided_text')
        self.assertEqual(row['coverage'],'partial excerpt')
        self.assertIn('benefits',row['evidence'])
        self.assertIn('not direct crawler fetches',result['warning'])
        self.assertTrue(any('$5,000' in item['mention'] for item in row['amount_mentions']))
        self.assertTrue(all(not item['context'].startswith('L5:') for item in row['amount_mentions']))

class HeadcountTests(unittest.TestCase):
    def test_saved_staff_mentions_keep_scope_date_and_qualifiers(self):
        url = 'https://example.com/news/team'
        excerpt = (
            'As of January 2020, Example reported more than 130 employees. '
            'It reported 109 people across Australian operations. '
            'Example has between 110 and 125 staff. '
            'Example reports 10k+ employees worldwide. '
            'Example reports 10k+ employees worldwide.'
        )
        packet = crawl.process_text_captures({'documents': [
            {'name': 'Example', 'url': url, 'acquisition': 'saved review', 'text': excerpt},
        ]})
        mentions = packet['results'][0]['headcount_mentions']
        self.assertEqual([row['mention'] for row in mentions], [
            'more than 130 employees', '109 people', 'between 110 and 125 staff', '10k+ employees',
        ])
        self.assertTrue(all(row['source'] == url for row in mentions))
        self.assertEqual(mentions[0]['context'], 'As of January 2020, Example reported more than 130 employees.')
        self.assertEqual(mentions[1]['context'], 'It reported 109 people across Australian operations.')
        self.assertTrue(all(row['employer_attribution'] == 'unbound' for row in mentions))

    def test_workforce_mentions_exclude_flow_forecasts_and_eligibility(self):
        controls = (
            'Example will have 150 employees next year.',
            'Example might employ 150 staff.',
            'Example plans to hire 130 staff.',
            'Example laid off 120 employees.',
            'Eligible startups have fewer than 500 employees.',
            'Example has 90 people at its launch.',
            'Example has 90 staff positions.',
            'New funding created 80 jobs.',
            'Example reported 1.5 people.',
            'Example has 130 staff from Acme working on its premises.',
            'Example has 130 staff supplied by a labour agency.',
            'Example plans to employ 109 people across its Australian operations and will expand elsewhere.',
        )
        self.assertEqual(crawl.extract_headcount_mentions(controls, 'https://example.com/'), [])

    def test_growth_quotes_keep_change_wording_and_stay_unbound(self):
        url = 'https://example.com/news/team'
        sentences = [
            '“We’ve grown from seven to 130 staff,” said Example co-founder.',
            '“We have grown from a team of 7 in May 2020 to 130 staff,” said Example co-founder.',
            '“We grew from seven staff to 130,” said Example co-founder.',
            'As of May 2025, Example had between 120 and 130 staff.',
            'As of May 2025, Example employed between 120 and 130 staff.',
        ]
        mentions = crawl.extract_headcount_mentions(sentences, url)
        self.assertEqual([row['mention'] for row in mentions], [
            'We’ve grown from seven to 130 staff',
            'We have grown from a team of 7 in May 2020 to 130 staff',
            'We grew from seven staff to 130',
            'between 120 and 130 staff',
            'between 120 and 130 staff',
        ])
        self.assertEqual([row['context'] for row in mentions], sentences)
        self.assertEqual([row.get('employer_attribution') for row in mentions], [
            'unbound', 'unbound', 'unbound', 'unbound', None,
        ])
        page = {'final_url': url, 'headcount_mentions': mentions}
        self.assertEqual(crawl.company_headcount_mentions('Example', page), mentions[-1:])

    def test_ambiguous_workforce_counts_remain_unbound_in_saved_page(self):
        url = 'https://example.com/'
        sentences = [
            'Ready Company has 130 employees of its customers enrolled in the training programme.',
            'Ready Company has 130 staff who work for Acme on its premises.',
            'Ready Company reported a team of 130 staff at the site.',
            'It currently employs 130 staff.',
        ]
        mentions = crawl.extract_headcount_mentions(sentences, url)
        self.assertEqual([row['context'] for row in mentions], sentences)
        self.assertEqual([row['employer_attribution'] for row in mentions], ['unbound'] * len(sentences))
        page = {'final_url': url, 'headcount_mentions': mentions}
        self.assertEqual(crawl.company_headcount_mentions('Ready Company', page), [])

    def test_negated_conditional_and_question_counts_are_excluded(self):
        sentences = [
            'Ready Company does not employ 100 staff.',
            'Ready Company doesn’t employ 100 staff.',
            'Ready Company no longer employs 100 staff.',
            'If Ready Company employs 100 staff, it qualifies.',
            'Does Ready Company employ 100 staff?',
            '“Does Ready Company employ 100 staff?” asked a reporter.',
            'It is unclear whether we have grown from seven to 100 staff.',
        ]
        self.assertEqual(crawl.extract_headcount_mentions(sentences, 'https://example.com/'), [])

    def test_explicit_ownership_supports_named_workforce_counts(self):
        url = 'https://example.com/'
        sentences = [
            'Ready Company’s global workforce was about 130 staff.',
            'Ready Company reported its headcount of more than 130 employees.',
            'Ready Company employs 130 staff, not including contractors.',
        ]
        mentions = crawl.extract_headcount_mentions(sentences, url)
        self.assertEqual([row['context'] for row in mentions], sentences)
        self.assertEqual([row['mention'] for row in mentions], [
            'about 130 staff', 'more than 130 employees', '130 staff',
        ])
        page = {'final_url': url, 'headcount_mentions': mentions}
        self.assertEqual(crawl.company_headcount_mentions('Ready Company', page), mentions)

    def test_diraq_possessive_team_lower_bound_survives_html_and_profile_staging(self):
        url = 'https://www.diraq.com/about'
        sentence = (
            "Diraq’s 130+ team brings together the world's best quantum talent with operations "
            "in Australia and the United States."
        )
        html = f'<p>{sentence}</p><h2>Employees</h2><h2>130 +</h2><h2>Patents</h2><h2>60 +</h2>'
        page = {**crawl.extract_page(html.encode(), url), 'final_url': url, 'checked_at': '2026-11-19T12:00:00Z'}
        expected = [{'mention': '130+ team', 'context': sentence, 'source': url}]
        self.assertEqual(page['headcount_mentions'], expected)
        candidate = crawl.company_profile_observation({'name': 'Diraq', 'website': url}, page)
        self.assertEqual(candidate['headcount_mentions'], expected)
        self.assertTrue(candidate['review_required'])
        self.assertEqual(crawl.company_headcount_mentions('Diraq Labs', page), [])

    def test_possessive_team_requires_an_attributed_prose_observation(self):
        url = 'https://example.com/about'
        attributed = 'As of May 2025, Ready Company’s 118+ team spans Australia and the United States.'
        other = 'Another Company’s 130+ team works in Sydney.'
        mentions = crawl.extract_headcount_mentions([other, attributed], url)
        self.assertEqual([row['context'] for row in mentions], [other, attributed])
        page = {'final_url': url, 'headcount_mentions': mentions}
        self.assertEqual(crawl.company_headcount_mentions('Ready Company', page), mentions[-1:])

        fragments = b'<h2>Employees</h2><h2>130 +</h2><h2>Patents</h2><h2>60 +</h2>'
        self.assertNotIn('headcount_mentions', crawl.extract_page(fragments, url))
        controls = (
            'Ready Company’s 130+ patents span several fields.',
            'Ready Company’s 130+ team projects span its research programmes.',
            'Ready Company’s 130+ team of customer employees works in Sydney.',
            'Ready Company’s customer’s 130+ team works in Sydney.',
            'Our 130+ team works in Sydney.',
            'Ready Company’s 130+ team will work in Sydney.',
            'If Ready Company’s 130+ team works in Sydney, it may qualify.',
        )
        self.assertEqual(crawl.extract_headcount_mentions(controls, url), [])

    def test_global_team_lower_bound_preserves_issuer_scope_and_review_status(self):
        url = (
            'https://www.diraq.com/newsdesk/diraq-signs-38m-letter-of-intent-with-the-us-department-of-commerce-'
            'under-chips-act-to-scale-domestic-quantum-computing-processors-using-silicon-spin-technology'
        )
        # The reconstruction keeps the source's founding preface, scope and office list structure.
        sentence = (
            'Founded in Sydney, Diraq has more than 100 team members globally, '
            'with operations in Palo Alto, Melbourne, and Chicago.'
        )
        html = (
            '<time>21 May</time><h2>About Diraq</h2>'
            f'<p>{sentence.replace("100", "<strong>100</strong>")}</p>'
        )
        page = {**crawl.extract_page(html.encode(), url), 'final_url': url, 'checked_at': '2026-11-19T12:00:00Z'}
        expected = [{'mention': 'more than 100 team members globally', 'context': sentence, 'source': url}]
        self.assertEqual(page['headcount_mentions'], expected)
        candidate = crawl.company_profile_observation({'name': 'Diraq', 'website': 'https://www.diraq.com/'}, page)
        self.assertTrue(candidate['review_required'])
        self.assertEqual(candidate['headcount_mentions'], expected)
        self.assertEqual(crawl.company_headcount_mentions('Diraq Labs', page), [])

    def test_global_team_bound_requires_direct_subject_scope_and_quantity(self):
        url = 'https://example.com/about'
        quantity = 'more than 100 team members globally'
        another = f'Founded in Sydney, Acme has {quantity}.'
        observed = f'Diraq has {quantity} and plans to expand its office.'
        explicit = 'Diraq has at least 100 team members globally.'
        plus = 'Diraq has 100+ team members globally.'
        mentions = crawl.extract_headcount_mentions([another, observed, explicit, plus], url)
        self.assertEqual([row['context'] for row in mentions], [another, observed, explicit, plus])
        self.assertEqual([row['mention'] for row in mentions], [
            quantity, quantity, 'at least 100 team members globally', '100+ team members globally',
        ])
        page = {'final_url': url, 'headcount_mentions': mentions}
        self.assertEqual(crawl.company_headcount_mentions('Diraq', page), mentions[1:])

        generic, = crawl.extract_headcount_mentions(['Diraq has more than 100 employees globally.'], url)
        self.assertEqual(generic['employer_attribution'], 'unbound')
        self.assertEqual(crawl.company_headcount_mentions('Diraq', {**page, 'headcount_mentions': [generic]}), [])
        controls = (
            'Diraq has more than 100 people globally.',
            'Diraq has more than 100 team members.',
            'Diraq has 100 team members globally.',
            'Diraq has more than 100 team members from its customers globally.',
            f'Diraq has {quantity} who work for its partners.',
            f'Diraq has {quantity} seconded from its partners.',
            f'Diraq has {quantity}, with operations in Sydney and a team of contractors.',
            f'Diraq has {quantity}, with operations in Sydney and Contractors.',
            f'Diraq has {quantity}, with operations in Melbourne and Partner Teams.',
            f'Diraq has {quantity}, including PhD students.',
            f'Diraq has {quantity} and contractors.',
            f"Diraq's careers page says it plans to have {quantity}.",
            f'Diraq has {quantity}?',
            f'Founded in Sydney by Diraq, Acme has {quantity}.',
            f'Founded in Sydney, a partner of Diraq has {quantity}.',
        )
        self.assertEqual(crawl.extract_headcount_mentions(controls, url), [])
        separate = f'Diraq has {quantity}. Separately, it supervises 12 PhD students in Sydney.'
        self.assertEqual(crawl.extract_headcount_mentions([separate], url, 'Diraq'), [
            {'mention': quantity, 'context': f'Diraq has {quantity}.', 'source': url},
        ])

    def test_joint_staff_and_students_remains_unbound_with_full_source_scope(self):
        url = (
            'https://www.nrf.gov.au/news-and-media-releases/'
            'national-reconstruction-fund-corporation-backs-next-generation-quantum-computing-startup-'
            'diraq-20-million-equity-investment'
        )
        published = 'Founded in 2022 and spun out of UNSW, Sydney, Diraq currently employs over 70 staff and PhD students in Sydney.'
        named = 'Diraq employs more than 70 staff and PhD students in Sydney.'
        punctuated = 'Diraq employs over 70 staff, and doctoral students in Sydney.'
        employees = 'As of May 2025, Diraq employed more than 70 employees in Sydney.'
        separate = 'Diraq employs 70 staff and supports four PhD students in Sydney.'
        sentences = [published, named, punctuated, employees, separate]
        mentions = crawl.extract_headcount_mentions(sentences, url)
        self.assertEqual([row['mention'] for row in mentions], [
            'over 70 staff and PhD students', 'more than 70 staff and PhD students',
            'over 70 staff, and doctoral students', 'more than 70 employees', '70 staff',
        ])
        self.assertEqual([row['context'] for row in mentions], sentences)
        self.assertEqual([row.get('employer_attribution') for row in mentions], ['unbound', 'unbound', 'unbound', None, None])
        page = {'final_url': url, 'headcount_mentions': mentions}
        self.assertEqual(crawl.company_headcount_mentions('Diraq', page), mentions[3:])

    def test_immediate_workforce_lists_and_inclusions_keep_shared_count_unbound(self):
        url = 'https://example.com/workforce'
        mixed = (
            'over 70 staff, PhD students and contractors',
            'over 70 staff and postgraduate students',
            'over 70 staff and contractors',
            'over 70 staff, doctoral students, and independent contractors',
            'over 70 staff, including postgraduate students',
            'over 70 staff including contractors',
            'over 70 staff, including 12 PhD students',
        )
        independent = (
            'over 70 staff and separately supervises 12 PhD students',
            'over 70 staff and 12 contractors',
            'over 70 staff and operates a research site',
            'over 70 staff, including engineers',
            'over 70 staff, including full-time employees',
        )
        sentences = [f'Diraq employs {phrase} in Sydney.' for phrase in (*mixed, *independent)]
        mentions = crawl.extract_headcount_mentions(sentences, url)
        self.assertEqual([row['context'] for row in mentions], sentences)
        self.assertEqual([row['mention'] for row in mentions], list(mixed) + ['over 70 staff'] * len(independent))
        self.assertEqual([row.get('employer_attribution') for row in mentions],
                         ['unbound'] * len(mixed) + [None] * len(independent))
        page = {'final_url': url, 'headcount_mentions': mentions}
        self.assertEqual(crawl.company_headcount_mentions('Diraq', page), mentions[len(mixed):])

    def test_named_observed_headcount_preserves_scope_and_later_plan(self):
        url = 'https://example.com/news/team'
        text = (
            'As of 8 July 2026, Example currently employs 109 people across its Australian operations, '
            'with plans to expand later.'
        )
        mentions = crawl.extract_headcount_mentions([text], url, 'Example')
        self.assertEqual(mentions, [{'mention': '109 people', 'context': text, 'source': url}])
        forecast = 'Example is planning to have 109 people in its Australian operations.'
        self.assertEqual(crawl.extract_headcount_mentions([forecast], url), [])

    def test_headcount_mentions_are_bounded_and_preserve_explicit_zero(self):
        rows = [f'Example employs {index} staff.' for index in range(20)]
        got = crawl.extract_headcount_mentions(rows, 'https://example.com/')
        self.assertEqual(len(got), crawl.MAX_HEADCOUNT_MENTIONS)
        self.assertEqual(got[0]['mention'], '0 staff')


class TransportTests(unittest.TestCase):
    def test_robots_paths_are_rejected_before_dns_or_network(self):
        transport=crawl.Transport()
        paths=['/robots.txt','/ROBOTS.TXT?x=1','/%72obots%2Etxt','/%2572obots.txt',
               '/nested%2frobots.txt','/a/../robots.txt','/robots.txt;version=1',
               '/robots.txt/extra','/robots.txt.','/a%5crobots.txt']
        with patch.object(crawl.socket,'getaddrinfo') as dns, patch.object(transport.opener,'open') as request:
            for path in paths:
                with self.subTest(path=path), self.assertRaisesRegex(crawl.CrawlError,'disabled by source policy'):
                    transport.request('https://example.com'+path)
            dns.assert_not_called()
            request.assert_not_called()

    def test_deeply_encoded_paths_fail_closed_before_network(self):
        transport=crawl.Transport()
        for suffix in ['72obots.txt','61bout']:
            url='https://example.com/%'+('25'*10000)+suffix
            with patch.object(crawl.socket,'getaddrinfo') as dns, patch.object(transport.opener,'open') as request:
                with self.assertRaisesRegex(crawl.CrawlError,'encoding exceeds'):
                    transport.request(url)
                dns.assert_not_called()
                request.assert_not_called()

    def test_ordinary_source_urls_keep_their_meaning(self):
        for path in ['/robotics','/robots.txt-guide','/robots.txt.png','/?topic=robots.txt','/about#robots.txt']:
            with self.subTest(path=path):
                result=crawl.normalize_request_url('https://example.com'+path)
                self.assertEqual(result,('https://example.com'+path).split('#')[0])

    def test_redirect_to_robots_is_rejected_before_second_request(self):
        class Response:
            status=302
            headers={'Location':'/%2572obots%252Etxt'}
            def __enter__(self): return self
            def __exit__(self,*args): pass
        transport=crawl.Transport()
        with patch.object(crawl.socket,'getaddrinfo',return_value=[(0,0,0,'',('93.184.216.34',443))]), patch.object(transport.opener,'open',return_value=Response()) as request:
            with self.assertRaisesRegex(crawl.CrawlError,'disabled by source policy'):
                transport.request('https://example.com/start')
            self.assertEqual(request.call_count,1)
            self.assertEqual(request.call_args.args[0].full_url,'https://example.com/start')

    def test_redirects_cannot_escape_host_or_skip_redirect_guard(self):
        class Response:
            status=302
            def __init__(self,location): self.headers={'Location':location}
            def __enter__(self): return self
            def __exit__(self,*args): pass
        t=crawl.Transport(); calls=[]
        def request_to(location):
            t.opener.open=lambda *args,**kwargs: (calls.append(args[0].full_url) or Response(location))
        with patch.object(crawl.socket,'getaddrinfo',return_value=[(0,0,0,'',('93.184.216.34',443))]), patch.object(crawl.time,'sleep'):
            request_to('https://other.example/private')
            with self.assertRaisesRegex(crawl.CrawlError,'leaves the approved'): t.request('https://example.com/start')
            self.assertEqual(len(calls),1)
            calls.clear(); request_to('/blocked')
            def deny(_): raise crawl.CrawlError('redirect denied by guard')
            with self.assertRaisesRegex(crawl.CrawlError,'redirect denied'): t.request('https://example.com/start',redirect_guard=deny)
            self.assertEqual(len(calls),1)

class WorkflowTests(unittest.TestCase):
    def test_company_location_crawl_saves_distinct_review_candidates(self):
        home = 'https://example.com/'
        contact = home + 'en-au/contact-us'
        pages = {
            home: b'''
              <a href="https://elsewhere.example/contact">Contact</a>
              <a href="mailto:team@example.com">Contact us</a>
              <a href="/news/contact">Contact news</a>
              <a href="/en-au/contact-us">Contact us</a>
              <p>Example is headquartered in <strong>St. Louis</strong>, United States.</p>
              <p>Example was headquartered in Melbourne, Australia.</p>
              <p>Example is not headquartered in Paris.</p>
              <p>Another company is headquartered in Berlin.</p>
              <p>Example's regional headquarters: Perth, Australia.</p>
              <p>Example is headquartered in Darwin until its next expansion.</p>
              <p>Example will be headquartered in Brisbane.</p>
              <script type="application/ld+json">
                {"@type":"Organization","name":"Example","url":"https://example.com/",
                "address":"Copenhagen, Denmark"}
              </script>
              <div hidden><p>Example is headquartered in Stockholm.</p></div>
              <blockquote><p>We are headquartered in Madrid.</p></blockquote>
            ''',
            contact: b'''
              <section><h2>Co-headquarters</h2><p>Sydney, Australia and London, United Kingdom</p></section>
              <dl><dt>Principal place of business</dt><dd>Fremantle, Australia</dd></dl>
              <section><h2>Headquarters</h2><button>Office search</button><p>Perth</p></section>
              <section><h2>Headquarters</h2></section><section><p>Adelaide</p></section>
              <address>Principal executive office: 100 First Street<br>St. Louis, United States</address>
              <p>We are based in Auckland, New Zealand.</p>
              <p aria-hidden="true">Headquarters: Toronto, Canada</p>
              <p style="display: none">Headquarters: Ottawa, Canada</p>
            ''',
        }
        calls = []

        class FixtureTransport:
            def __init__(self, _delay):
                pass

            def request(self, url, allowed_host=None, **kwargs):
                calls.append((url, allowed_host))
                return 200, {'Content-Type': 'text/html'}, pages[url], url

        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / 'data').mkdir()
            catalogue = root / 'data/catalogue.json'
            catalogue.write_text('{}')
            overlay = root / 'data/startup-research.json'
            researched = json.dumps({'startups': [{'name': 'Example', 'website': home}]})
            overlay.write_text(researched)
            seeds = root / 'approved.csv'
            seeds.write_text(f'partner,official_website,approved\nExample,{home},yes\n')
            with patch.object(crawl, 'ROOT', root), patch.object(crawl, 'CATALOGUE', catalogue), \
                    patch.object(crawl, 'Transport', FixtureTransport):
                self.assertEqual(crawl.main([
                    'company-profiles', '--approved', str(seeds), '--out', str(root / 'packets'),
                    '--follow', '1',
                ]), 0)
            packet = json.loads((root / 'packets/latest-company-profiles.json').read_text())
            self.assertEqual(overlay.read_text(), researched)

        self.assertEqual(calls, [(home, 'example.com'), (contact, 'example.com')])
        profiles = [row for row in packet['candidates'] if row['kind'] == 'company-profile']
        for page, candidate in zip(packet['results'][0]['pages'], profiles, strict=True):
            self.assertEqual(candidate['source_url'], page['final_url'])
            self.assertEqual(candidate['checked_at'], page['checked_at'])
            self.assertEqual(candidate['location_mentions'], page['location_mentions'])
            self.assertTrue(candidate['review_required'])
        self.assertEqual(
            [(row['kind'], row['location'], row['time_scope']) for row in profiles[0]['location_mentions']],
            [('headquarters', 'St. Louis, United States', 'unspecified'),
             ('headquarters', 'Melbourne, Australia', 'historical')],
        )
        self.assertEqual(
            [(row['kind'], row['location'], row['source']) for row in profiles[1]['location_mentions']],
            [('co-headquarters', 'Sydney, Australia and London, United Kingdom', contact),
             ('business-base', 'Fremantle, Australia', contact),
             ('headquarters', '100 First Street St. Louis, United States', contact),
             ('business-base', 'Auckland, New Zealand', contact)],
        )
        self.assertNotIn('country', profiles[1]['location_mentions'][0])

    def test_company_location_mentions_require_attribution_and_are_bounded(self):
        source = 'https://example.com/news/company-update'
        named = b'<p>Example is based in Singapore.</p>'
        anonymous = b'<p>Headquarters: Berlin, Germany.</p><p>We are based in Melbourne.</p>'
        result = crawl.extract_page(anonymous + named, source, company_name='Example')
        self.assertEqual(len(result['location_mentions']), 1)
        self.assertEqual(result['location_mentions'][0]['context'], 'Example is based in Singapore.')
        self.assertNotIn('location_mentions', crawl.extract_page(named, source))
        repeated = [
            f'Example is headquartered in City {index}.' for index in range(crawl.MAX_LOCATION_MENTIONS + 4)
        ]
        mentions = crawl.extract_location_mentions([*repeated[:1], *repeated], source, 'Example')
        self.assertEqual(len(mentions), crawl.MAX_LOCATION_MENTIONS)
        self.assertEqual(mentions[1]['location'], 'City 1')

    def test_company_profile_mode_retains_subject_claims_without_fetching_assets(self):
        class Fake:
            def __init__(self): self.calls=[]
            def request(self,url,allowed_host=None,**kwargs):
                self.calls.append(url)
                html=b'''<meta name="description" content="Source description"><script type="application/ld+json">{"@type":"Person","name":"Ada","jobTitle":"Researcher","image":"https://cdn.example/ada.jpg","sameAs":["https://www.linkedin.com/in/ada"]}</script><img alt="Ada" src="/ada.jpg"><a href="https://www.linkedin.com/company/example">LinkedIn</a><img class="logo" src="/logo.svg">'''
                return 200,{'Content-Type':'text/html'},html,url
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'approved.csv'
            path.write_text('partner,official_website,approved\nExample,https://example.com/,yes\n')
            args=types.SimpleNamespace(approved=path,partner=None,limit=0,follow=0)
            transport=Fake()
            result=crawl.crawl_company_profiles([{'name':'Example','website':'https://example.com/'}],args,transport)
            self.assertEqual(transport.calls,['https://example.com/'])
            self.assertEqual(result['mode'],'company-profiles')
            self.assertTrue(all(row['company']=='Example' and row['review_required'] and 'partner' not in row for row in result['candidates']))
            profile=next(row for row in result['candidates'] if row['kind']=='company-profile')
            self.assertEqual(profile['description'],'Source description')
            self.assertEqual(profile['structured_subjects'][0]['jobTitle'],'Researcher')
            self.assertEqual(profile['structured_subjects'][0]['name'],'Ada')
            self.assertEqual(profile['logo_candidates'][0]['url'],'https://example.com/logo.svg')
            self.assertEqual(result['coverage']['unreviewed_candidates'],len(result['candidates']))
            self.assertTrue(profile['source_url'] and profile['checked_at'])

    def test_company_about_links_and_accessible_icon_socials_are_discovered(self):
        page=crawl.extract_page(b'<a href="/about">About</a><a href="https://x.com/Example" aria-label="X (Twitter)"><svg></svg></a><a href="https://youtube.com/@Example" title="YouTube"></a>', 'https://example.com/')
        self.assertEqual(crawl.profile_landing_links(page,'https://example.com/',2),[])
        self.assertEqual(crawl.profile_landing_links(page,'https://example.com/',2,include_about=True),[{'kind':'about','url':'https://example.com/about'}])
        page.update(final_url='https://example.com/',checked_at='2026-11-17')
        self.assertEqual([row['name'] for row in crawl.extract_profile_media_leads('Example',page,'homepage')],['X (Twitter)','YouTube'])

    def test_company_profile_rejects_unknown_identity_or_changed_host_before_fetch(self):
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'approved.csv'
            args=types.SimpleNamespace(approved=path,partner=None,limit=0,follow=0)
            class NoFetch:
                def request(self,*args,**kwargs): raise AssertionError('Must not fetch')
            for name,url in [('Unknown','https://example.com/'),('Example','https://other.example/')]:
                path.write_text(f'partner,official_website,approved\n{name},{url},yes\n')
                with self.assertRaises(crawl.CrawlError):
                    crawl.crawl_company_profiles([{'name':'Example','website':'https://example.com/'}],args,NoFetch())

    def test_profile_crawl_follows_only_approved_host_and_stages_unverified_links(self):
        class Fake:
            def __init__(self): self.calls=[]
            def request(self,url,allowed_host=None,**kwargs):
                self.calls.append((url,allowed_host))
                pages={
                    'https://example.com/':b'<a href="/team">Our Team</a><a href="https://evil.test/portfolio">Portfolio</a><a href="/companies">Companies</a>',
                    'https://example.com/team':b'<li><a href="/team/jane-doe">Jane Doe</a> Partner</li><a href="https://evil.test/people/person">Outside Person</a>',
                    'https://example.com/companies':b'<a href="/companies/acme">Acme</a><a href="/companies">Companies</a>'
                }
                return 200,{'Content-Type':'text/html'},pages[url],url
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'approved.csv'
            path.write_text('partner,qid,official_website,approved\nExample,,https://example.com/,yes\n')
            args=types.SimpleNamespace(approved=path,partner=None,limit=0,follow=2)
            transport=Fake()
            got=crawl.crawl_profiles({'partnerLeads':['Example']},args,transport)
            self.assertEqual([url for url,_ in transport.calls],['https://example.com/','https://example.com/team','https://example.com/companies'])
            self.assertTrue(all(host=='example.com' for _,host in transport.calls))
            self.assertTrue(all('/robots.txt' not in url for url,_ in transport.calls))
            leads=got['candidates']
            self.assertEqual([r['name'] for r in leads],['Jane Doe','Acme'])
            self.assertTrue(all(r['review_required'] for r in leads))
            self.assertEqual(leads[0]['source_url'],'https://example.com/team')
            self.assertIn('Partner',leads[0]['context'])
            self.assertEqual(got['mode'],'profiles')
            self.assertEqual(got['coverage']['fetch_status'],'all_succeeded')
            self.assertEqual(got['coverage']['pages_succeeded'],3)
            self.assertEqual(got['coverage']['unreviewed_candidates'],2)
    def test_profile_headshot_binding_preserves_same_page_evidence_before_dedupe(self):
        fixture = Path(__file__).parent / 'fixtures/team-image-dedupe-crawl-46.json'
        home, team = json.loads(fixture.read_text())['observations'].items()
        class Fake:
            def request(self, url, allowed_host=None, **kwargs):
                if url not in (home[0], team[0]):
                    raise AssertionError(f'Unexpected fetch: {url}')
                return 200, {'Content-Type': 'text/html'}, b'', url

        for repeat in (True, False):
            with self.subTest(repeat=repeat), tempfile.TemporaryDirectory() as tmp:
                path = Path(tmp) / 'approved.csv'
                path.write_text(f'partner,qid,official_website,approved\nArtesian,,{home[0]},yes\n')
                args = types.SimpleNamespace(approved=path, partner=None, limit=0, follow=1)
                def observations(body, url, **kwargs):
                    if url == home[0]:
                        return {**home[1], 'profile_links': [{'url': team[0], 'text': 'Our team'}]}
                    return {**team[1], 'image_candidates': team[1]['image_candidates'] if repeat else []}
                with patch.object(crawl, 'extract_page', side_effect=observations):
                    result = crawl.crawl_profiles({'partnerLeads': ['Artesian']}, args, Fake())
                people = [r for r in result['candidates'] if r['kind'] == 'people']
                images = [r for r in result['candidates'] if r['kind'] == 'image']
                self.assertEqual(len(people), 1)
                self.assertEqual(len(images), 1)
                self.assertEqual(images[0]['source_url'], home[0])
                self.assertEqual(result['coverage']['profile_headshot_bindings'], int(repeat))
                if repeat:
                    self.assertEqual(people[0]['headshot_candidate']['source_url'], team[0])
                    self.assertEqual(people[0]['headshot_candidate']['status'], 'not_fetched')
                else:
                    self.assertNotIn('headshot_candidate', people[0])

    def test_profile_index_selection_rejects_external_and_individual_links(self):
        page={'profile_links':[
            {'url':'https://other.test/team','text':'Team'},
            {'url':'https://example.com/team/jane','text':'Team member'},
            {'url':'https://example.com/team','text':'Meet the team'},
            {'url':'https://example.com/companies','text':'Our companies'}
        ]}
        self.assertEqual(crawl.profile_landing_links(page,'https://example.com/',2),[
            {'kind':'people','url':'https://example.com/team'},
            {'kind':'companies','url':'https://example.com/companies'}])
        self.assertEqual(crawl.profile_landing_links(page,'https://example.com/',0),[])

    def test_directory_discovery_preserves_provenance_without_following_candidates(self):
        class Fake:
            delay=1
            def __init__(self): self.calls=[]
            def request(self,url,*args,**kwargs):
                self.calls.append(url)
                if url.endswith('/robots.txt'): return 404,{},b'',url
                html=b'''<table><tr><th>Navigation</th></tr></table><table><tr><th>Partner</th><th>Type</th></tr><tr><td><a href="https://new.example/">Example Ventures</a></td><td>Venture Capital, Startup Ecosystem Partner</td></tr><tr><td>8VC</td><td>Venture Capital</td></tr><tr><td>8VC</td><td>Venture Capital</td></tr><tr><td>Example Retail</td><td>Retail</td></tr></table>'''
                return 200,{'Content-Type':'text/html'},html,url
        registry={'sources':[{'id':'one','name':'Official directory','url':'https://example.com/partners','scope':'Not specified','provider':'Example provider','name_column':'Partner','type_column':'Type','accepted_types':['Venture Capital','Accelerator/Incubator','Startup Ecosystem Partner']}]}
        args=types.SimpleNamespace(only=[],approved=None,limit=0,follow=0,partners_only=False)
        transport=Fake(); result=crawl.crawl_partner_directories(registry,{'partnerLeads':['8VC']},args,transport)
        self.assertEqual([item['name'] for item in result['candidates']],['Example Ventures','8VC'])
        candidate=result['candidates'][0]
        self.assertEqual(candidate['source_url'],'https://example.com/partners')
        self.assertEqual(candidate['source_scope'],'Not specified')
        self.assertEqual(candidate['provider'],'Example provider')
        self.assertTrue(candidate['checked_at'])
        self.assertEqual(candidate['website_candidate'],'https://new.example/')
        self.assertFalse(candidate['existing_lead_exact'])
        self.assertTrue(result['candidates'][1]['existing_lead_exact'])
        self.assertTrue(all(item['review_required'] for item in result['candidates']))
        self.assertEqual(transport.calls,['https://example.com/partners'])
    def test_featured_headings_and_paragraph_context_are_bounded_leads(self):
        pages={
            'https://example.com/aws':b'<h2>Featured Activate Providers</h2><h3>Accel</h3><h3>Carta</h3><h2>Frequently asked questions</h2><h3>Not a provider</h3>',
            'https://example.com/vic':b'<p><a href="https://boab.example/">Boab AI</a> and <a href="https://other.example/">Other</a> will each receive up to $400,000 to deliver pre-accelerator programs.</p><p><a href="https://noise.example/">News</a> is unrelated.</p>',
            'https://example.com/claim':b'<title>Investor update</title><h1>Joins the Microsoft for Startups Investor Network</h1>'
        }
        class Fake:
            delay=1
            def request(self,url,*args,**kwargs): return 200,{},pages[url],url
        registry={'sources':[
            {'id':'aws','name':'AWS','url':'https://example.com/aws','provider':'AWS','scope':'World','format':'heading_section','section_title':'Featured Activate Providers','section_level':'h2','entry_level':'h3','reported_type':'Featured provider'},
            {'id':'vic','name':'Victoria','url':'https://example.com/vic','provider':'LaunchVic','scope':'Victoria','format':'context_links','context_phrase':'will each receive up to $400,000 to deliver pre-accelerator programs','reported_type':'Funded recipient'},
            {'id':'ms','name':'Claim','url':'https://example.com/claim','provider':'Microsoft','scope':'Unknown','format':'self_report','claim_phrase':'Microsoft for Startups Investor Network','claim_name':'Henson Venture Partners','reported_type':'Self-reported'}
        ]}
        args=types.SimpleNamespace(only=[],approved=None,limit=0,follow=0,partners_only=False)
        result=crawl.crawl_partner_directories(registry,{'partnerLeads':['Accel']},args,Fake())
        self.assertEqual([row['name'] for row in result['candidates']],['Accel','Carta','Boab AI','Other','Henson Venture Partners'])
        self.assertEqual(result['candidates'][2]['website_candidate'],'https://boab.example/')
        self.assertTrue(result['candidates'][0]['existing_lead_exact'])
        self.assertTrue(all(row['review_required'] for row in result['candidates']))
        self.assertEqual(result['notes'],[])

    def test_directory_missing_table_is_reported(self):
        class Fake:
            delay=1
            def request(self,url,*args,**kwargs):
                return (404,{},b'',url) if url.endswith('/robots.txt') else (200,{'Content-Type':'text/html'},b'<main>Directory loaded by script</main>',url)
        registry={'sources':[{'id':'one','name':'Directory','url':'https://example.com/','scope':'Not specified','provider':'Provider','name_column':'Partner','type_column':'Type','accepted_types':['Venture Capital']}]}
        args=types.SimpleNamespace(only=[],approved=None,limit=0,follow=0,partners_only=False)
        result=crawl.crawl_partner_directories(registry,{'partnerLeads':[]},args,Fake())
        self.assertEqual(result['candidates'],[])
        self.assertIn('No matching partner table',result['notes'][0]['message'])
    def test_directory_leads_can_be_enriched_without_losing_source_or_auto_approval(self):
        lead={'name':'=Example Ventures','reported_type':'Venture Capital','provider':'Provider','source_name':'Directory','source_url':'https://example.com/directory','source_scope':'Not specified','checked_at':'2026-11-12','website_candidate':'','existing_lead_exact':False}
        responses=[{'search':[{'id':'Q42','label':'Example Ventures'}]}, {'entities':{'Q42':{'claims':{}}}}]
        with tempfile.TemporaryDirectory() as tmp:
            directory=Path(tmp)/'directory.csv'; review=Path(tmp)/'review.csv'
            crawl.write_partner_directory_review_csv(directory,{'candidates':[lead]})
            args=types.SimpleNamespace(partner=None,limit=0,candidates=5,leads=directory)
            with patch.object(crawl,'api_json',side_effect=responses): result=crawl.discover({'partnerLeads':[]},args,object())
            self.assertEqual(result['results'][0]['partner'],'=Example Ventures')
            self.assertEqual(result['results'][0]['directory_source']['url'],'https://example.com/directory')
            crawl.write_review_csv(review,result)
            with review.open(newline='') as handle: row=next(csv.DictReader(handle))
            self.assertEqual(row['partner'],"'=Example Ventures")
            self.assertEqual(row['directory_checked_at'],'2026-11-12')
            self.assertEqual(row['approved'],'')
    def test_logo_capture_stages_only_approved_host_candidates(self):
        class Fake:
            delay=1
            calls=[]
            def request(self,url,*args,**kwargs):
                self.calls.append(url)
                if url.endswith('/robots.txt'): return 200,{},b'User-agent: *\nDisallow: /blocked.png\n',url
                return 200,{'Content-Type':'image/png'},b'\x89PNG\r\n\x1a\nexample',url
        with tempfile.TemporaryDirectory() as tmp:
            snapshot={'results':[{'name':'Example','pages':[{'status':'ok','final_url':'https://example.com/','logo_candidates':[
                {'url':'https://example.com/logo.png','kind':'page-logo-image','source':'https://example.com/','same_host':True,'review_required':True},
                {'url':'https://example.com/blocked.png','kind':'site-icon','source':'https://example.com/','same_host':True,'review_required':True},
                {'url':'https://cdn.example.com/logo.png','kind':'structured-logo','source':'https://example.com/','same_host':False,'review_required':True},
                {'url':'https://example.com/share.png','kind':'social-image','source':'https://example.com/','same_host':True,'review_required':True}]}]}]}
            transport=Fake();result=crawl.stage_partner_logos(snapshot,types.SimpleNamespace(out=Path(tmp),logo_limit=3),transport)
            by_url={r['url']:r['status'] for r in result['candidates']}
            self.assertEqual(by_url,{'https://example.com/logo.png':'captured','https://example.com/blocked.png':'duplicate','https://cdn.example.com/logo.png':'not_fetched','https://example.com/share.png':'not_fetched'})
            captured=next(r for r in result['candidates'] if r['url']=='https://example.com/logo.png')
            self.assertTrue(Path(captured['file']).name.endswith('.bin'))
            coverage=result['coverage']
            self.assertEqual((coverage['page_observations'],coverage['successful_page_observations']), (1,1))
            self.assertEqual(coverage['logo_candidates'],{
                'observed':4,'capture_attempted':2,'captured':1,'duplicate':1,
                'skipped':0,'not_fetched':2,'distinct_captured_files':1,
            })
            self.assertIn('https://example.com/blocked.png',transport.calls)
            self.assertFalse(any('/robots.txt' in url for url in transport.calls))
            self.assertNotIn('https://cdn.example.com/logo.png',transport.calls)
            self.assertNotIn('https://example.com/share.png',transport.calls)
    def test_duplicate_logo_bytes_do_not_use_unique_slots_and_attempts_are_bounded(self):
        class Fake:
            def __init__(self): self.calls=[]
            def request(self,url,*args,**kwargs):
                self.calls.append(url)
                payload=b'<svg xmlns="http://www.w3.org/2000/svg">'+(b'unique' if url.endswith('/third.svg') else b'duplicate')+b'</svg>'
                return 200,{},payload,url
        with tempfile.TemporaryDirectory() as tmp:
            def candidate(n):
                return {'url':'https://example.com/'+n,'kind':'page-logo-image','source':'https://example.com/','same_host':True}
            page={'status':'ok','final_url':'https://example.com/','logo_candidates':[candidate(n) for n in ('first.svg','second.svg','third.svg')]}
            transport=Fake()
            rows=crawl.stage_partner_logos({'results':[{'name':'Example','pages':[page]}]},types.SimpleNamespace(out=Path(tmp),logo_limit=2),transport)['candidates']
            self.assertEqual([row['status'] for row in rows],['captured','duplicate','captured'])
            self.assertEqual(len(transport.calls),3)
            self.assertEqual(rows[0]['sha256'],rows[1]['sha256'])
            page['logo_candidates']=[candidate(str(n)+'.svg') for n in range(10)]
            transport=Fake()
            rows=crawl.stage_partner_logos({'results':[{'name':'Example','pages':[page]}]},types.SimpleNamespace(out=Path(tmp),logo_limit=2),transport)['candidates']
            self.assertEqual(len(transport.calls),6)
            self.assertEqual(rows[-1]['reason'],'Per-site attempt limit reached')

    def test_logo_coverage_does_not_confuse_page_failure_or_identical_files_with_coverage(self):
        asset=lambda status, **kw: {'status':status, **kw}
        page={'status':'ok'}
        results=[{'pages':[page,{'status':'skipped'}]},{'pages':[page]}]
        candidates=[
            asset('captured',sha256='same'),asset('captured',sha256='same'),
            asset('duplicate',sha256='same'),asset('skipped'),asset('not_fetched'),
        ]
        coverage=crawl.logo_capture_coverage(results,candidates)
        self.assertEqual(coverage['fetch_status'],'partial')
        self.assertEqual(coverage['failed_page_observations'],1)
        self.assertEqual(coverage['page_observations'],3)
        self.assertEqual(coverage['successful_page_observations'],2)
        self.assertIn('may reuse', coverage['note'])
        self.assertNotIn('pages_attempted',coverage)
        self.assertEqual(coverage['logo_candidates'],{
            'observed':5,'capture_attempted':4,'captured':2,'duplicate':1,
            'skipped':1,'not_fetched':1,'distinct_captured_files':1,
        })
        empty=crawl.logo_capture_coverage([],[])
        self.assertEqual(empty['fetch_status'],'not_attempted')
        self.assertTrue(all(value==0 for value in empty['logo_candidates'].values()))


    def test_approved_asset_host_requires_exact_host(self):
        class Fake:
            delay=1
            def __init__(self): self.calls=[]
            def request(self,url,allowed_host=None,**kwargs):
                self.calls.append((url,allowed_host))
                if url.endswith('/robots.txt'): return 200,{},b'User-agent: *\nDisallow: /blocked.png\n',url
                return 200,{'Content-Type':'image/png'},b'\x89PNG\r\n\x1a\nexample',url
        with tempfile.TemporaryDirectory() as tmp:
            def candidate(url):
                return {'url':url,'kind':'page-logo-image','source':'https://example.com/','same_host':False,'review_required':True}
            snapshot={'results':[{'name':'Example','asset_hosts':['cdn.example.com'],'pages':[{'status':'ok','final_url':'https://example.com/','logo_candidates':[
                candidate('https://cdn.example.com/logo.png'),
                candidate('https://cdn.example.com/blocked.png'),
                candidate('https://other.example.com/logo.png')
            ]}]}]}
            transport=Fake()
            result=crawl.stage_partner_logos(snapshot,types.SimpleNamespace(out=Path(tmp),logo_limit=3),transport)
            self.assertEqual([r['status'] for r in result['candidates']],['captured','duplicate','not_fetched'])
            self.assertFalse(any('/robots.txt' in url for url,_ in transport.calls))
            self.assertIn(('https://cdn.example.com/logo.png','cdn.example.com'),transport.calls)
            self.assertIn(('https://cdn.example.com/blocked.png','cdn.example.com'),transport.calls)
            self.assertFalse(any(url.startswith('https://other.example.com') for url,_ in transport.calls))

    def test_icon_file_is_staged_as_opaque_bytes(self):
        class Fake:
            delay=1
            def request(self,url,*args,**kwargs):
                if url.endswith('/robots.txt'): return 404,{},b'',url
                return 200,{'Content-Type':'image/x-icon'},bytes.fromhex('000001000100')+b'placeholder',url
        with tempfile.TemporaryDirectory() as tmp:
            snapshot={'results':[{'name':'Example','pages':[{'status':'ok','final_url':'https://example.com/','logo_candidates':[
                {'url':'https://example.com/favicon.ico','kind':'site-icon','source':'https://example.com/','same_host':True}
            ]}]}]}
            result=crawl.stage_partner_logos(snapshot,types.SimpleNamespace(out=Path(tmp),logo_limit=1),Fake())
            self.assertEqual(result['candidates'][0]['status'],'captured')
            self.assertEqual(result['candidates'][0]['format'],'ico')
            self.assertTrue(result['candidates'][0]['file'].endswith('.bin'))

    def test_capture_limit_prefers_richer_icon_over_favicon(self):
        class Fake:
            delay=1
            def request(self,url,*args,**kwargs):
                if url.endswith('/robots.txt'): return 404,{},b'',url
                return 200,{},b'<svg xmlns="http://www.w3.org/2000/svg"></svg>',url
        with tempfile.TemporaryDirectory() as tmp:
            def item(path):
                return {'url':'https://example.com/'+path,'kind':'site-icon','source':'https://example.com/','same_host':True}
            snapshot={'results':[{'name':'Example','pages':[{'status':'ok','final_url':'https://example.com/','logo_candidates':[item('favicon.ico'),item('brand.svg')]}]}]}
            rows=crawl.stage_partner_logos(snapshot,types.SimpleNamespace(out=Path(tmp),logo_limit=1),Fake())['candidates']
            self.assertEqual([(row['url'].rsplit('/',1)[-1],row['status']) for row in rows],[('brand.svg','captured'),('favicon.ico','not_fetched')])

    def test_capture_limit_prefers_structured_logo_over_favicons(self):
        # Regression: the first candidates under --logo-limit were favicons,
        # so the structured logo stayed not_fetched (Wing VC in Nov 2026).
        class Fake:
            delay=1
            def request(self,url,*args,**kwargs):
                return 200,{},b'\x89PNG\r\n\x1a\nexample',url
        with tempfile.TemporaryDirectory() as tmp:
            def item(path,kind):
                return {'url':'https://example.com/'+path,'kind':kind,'source':'https://example.com/','same_host':True}
            snapshot={'results':[{'name':'Example','pages':[{'status':'ok','final_url':'https://example.com/','logo_candidates':[
                item('favicon.png','site-icon'),item('touch.png','site-icon'),item('brand.png','structured-logo'),item('header.png','page-logo-image')]}]}]}
            rows=crawl.stage_partner_logos(snapshot,types.SimpleNamespace(out=Path(tmp),logo_limit=1),Fake())['candidates']
            self.assertEqual([(row['url'].rsplit('/',1)[-1],row['status']) for row in rows],
                             [('brand.png','captured'),('header.png','not_fetched'),('favicon.png','not_fetched'),('touch.png','not_fetched')])

    def test_headshot_staging_fetches_only_approved_portrait_hosts(self):
        class Fake:
            delay=1
            def request(self,url,allowed_host=None,*args,**kwargs):
                if 'linkedin.com' in url: raise AssertionError('LinkedIn must never be fetched')
                return 200,{},b'\x89PNG\r\n\x1a\nexample',url
        bio={'company':'Example Co','name':'Alex Example','role':'Founder','checked_at':'2026-11-21T00:00:00Z',
             'headshot_candidate':{'candidate_url':'https://example.com/team/alex.png','source_url':'https://example.com/team','status':'not_fetched'}}
        external=dict(bio,headshot_candidate={'candidate_url':'https://cdn.other.com/alex.png','source_url':'https://example.com/team','status':'not_fetched','reason':'External asset host requires separate review'})
        social=dict(bio,headshot_candidate={'candidate_url':'https://www.linkedin.com/in/alex','source_url':'https://example.com/team','status':'not_fetched'})
        scoped=dict(bio,headshot_candidate={'candidate_url':'https://example.com/team/alex.png','source_url':'https://example.com/team','status':'not_fetched'})
        result={'candidates':[bio,external,social,scoped]}
        scopes={'Example Co':{'version':1,'allowed_urls':['https://example.com/team'],'denied_urls':[],'max_follow':1}}
        with tempfile.TemporaryDirectory() as tmp:
            rows=crawl.stage_headshots({'candidates':[bio,external,social]}, {}, types.SimpleNamespace(out=Path(tmp)), Fake())
            self.assertEqual([row['status'] for row in rows],['captured','not_fetched','not_fetched'])
            self.assertEqual(rows[0]['format'],'png')
            self.assertTrue(Path(rows[0]['file']).name.endswith('.bin'))
            self.assertEqual(rows[1]['reason'],'External asset host requires separate review')
            self.assertEqual(rows[2]['reason'],'Social hosts are never fetched as headshots')
            scoped_rows=crawl.stage_headshots(result, scopes, types.SimpleNamespace(out=Path(tmp)), Fake())
            self.assertEqual(scoped_rows[-1]['reason'],'Scoped document approval does not authorize asset downloads')

    def test_portrait_coverage_separates_alt_leads_from_bio_and_staging_rows(self):
        site = 'https://example.com'
        page = {'url': site, 'status': 'ok', 'image_candidates': [{'alt': 'Photo of Ada Example'}]}
        alt = {'kind': 'image', 'name': 'Photo of Ada Example', 'candidate_url': site + '/ada.png'}
        other_image = {'kind': 'image', 'name': 'Office building'}
        social = {'kind': 'social', 'name': 'LinkedIn'}
        bios = []
        for company, path, reason in (
            ('Example', '/ada.png', 'Rights and image review required'),
            ('Scoped', '/scoped.png', 'Rights and image review required'),
            ('Example', '/unavailable.png', 'Rights and image review required'),
            ('Example', '', 'External asset host requires separate review'),
        ):
            bio = {'kind': 'professional-bio', 'name': 'Ada Example', 'company': company,
                   'source_url': site, 'review_required': True}
            if path:
                bio['headshot_candidate'] = {'candidate_url': site + path, 'source_url': site,
                                              'status': 'not_fetched', 'reason': reason}
            else:
                bio['headshot_candidate'] = {'candidate_url': 'https://external.example/ada.png',
                                              'source_url': site, 'status': 'not_fetched', 'reason': reason}
            bios.append(bio)
        bios.append({'kind': 'professional-bio', 'name': 'Bio without an image', 'company': 'Example'})
        raw = {'results': [{'name': 'Example', 'pages': [page]},
                           {'name': 'Scoped', 'crawl_scope': {'version': 1}, 'pages': []}],
               'candidates': [alt, other_image, social, *bios]}
        body = b'\x89PNG\r\n\x1a\nsynthetic'
        transport = object()

        def fetch(client, url):
            self.assertIs(client, transport)
            if url == site + '/ada.png':
                return body, 'png', url
            if url == site + '/unavailable.png':
                raise crawl.CrawlError('Unavailable in mocked transport')
            self.fail(f'Unexpected portrait staging target: {url}')

        with tempfile.TemporaryDirectory() as tmp, patch.object(crawl, 'crawl_company_profiles',
                return_value=raw), patch.object(crawl, 'fetch_image_bytes', side_effect=fetch) as requested:
            result = crawl.crawl_portraits(types.SimpleNamespace(out=Path(tmp)), transport)
            self.assertEqual([item.args[1] for item in requested.call_args_list],
                             [site + '/ada.png', site + '/unavailable.png'])
            self.assertEqual(result['results'][0]['pages'], [page])
            self.assertEqual(result['candidates'][0], {**alt, 'headshot': True, 'person_name': 'Ada Example'})
            self.assertEqual(result['candidates'][1:7], [social, *bios])
            staged = result['candidates'][7:]
            self.assertEqual([row['status'] for row in staged],
                             ['captured', 'not_fetched', 'skipped', 'not_fetched'])
            self.assertTrue(all(row['review_required'] for row in staged))
            files = list((Path(tmp) / 'portrait-files').glob('*.bin'))
            self.assertEqual([f.read_bytes() for f in files], [body])

        self.assertEqual(result['coverage']['unreviewed_candidates'], 11)
        self.assertEqual(result['coverage']['portraits'], {
            'alt_label_leads': 1, 'excluded_image_observations': 1,
            'professional_bio_rows': 5, 'bio_headshot_candidates': 4,
            'staging_rows': 4, 'staging_attempted': 2, 'captured': 1,
            'not_fetched': 2, 'skipped': 1, 'staged_bytes': len(body),
        })

    def test_portrait_coverage_reports_explicit_zero_staging_for_label_only(self):
        candidates = [{'kind': 'image', 'name': 'Photo of Ada Example'},
                      {'kind': 'company-profile', 'name': 'Example'}]
        with (patch.object(crawl, 'crawl_company_profiles',
                           return_value={'results': [], 'candidates': candidates}),
              patch.object(crawl, 'stage_headshots', return_value=[]) as stage):
            result = crawl.crawl_portraits(object(), object())
        self.assertEqual(stage.call_args.args[0]['candidates'], result['candidates'])
        self.assertEqual(result['coverage']['unreviewed_candidates'], 2)
        self.assertEqual(result['coverage']['portraits'], {
            'alt_label_leads': 1, 'excluded_image_observations': 0,
            'professional_bio_rows': 0, 'bio_headshot_candidates': 0,
            'staging_rows': 0, 'staging_attempted': 0, 'captured': 0,
            'not_fetched': 0, 'skipped': 0, 'staged_bytes': 0,
        })

    def test_headshot_person_name_accepts_photo_of_a_person(self):
        self.assertEqual(crawl.headshot_person_name('Photo of Jane Smith'), 'Jane Smith')
        self.assertEqual(crawl.headshot_person_name('Photo of Prof. Jeremy O\'Brien'), 'Prof. Jeremy O\'Brien')
        self.assertEqual(crawl.headshot_person_name('Photo of The Honorable Stephen E. Biegun'),
                         'The Honorable Stephen E. Biegun')
        self.assertEqual(crawl.headshot_person_name('Photo of Ludwig van Beethoven'), 'Ludwig van Beethoven')
        self.assertEqual(crawl.headshot_person_name('  Photo of  Niklas Zennström '), 'Niklas Zennström')

    def test_headshot_person_name_rejects_page_imagery(self):
        # Logo, facility, hero/news captions and empty or missing alt text
        # never name a person, even when they begin with 'Photo of'.
        for label in ('', 'PsiQuantum', 'Logo Placeholder', 'Brisbane site',
                      'PsiQuantum headquarters in Palo Alto, California',
                      'Aerial view of the site under construction',
                      'Photo of the team', 'Photo of Brisbane site',
                      'Photo of Fab 8 in Malta, New York', None, 42):
            self.assertIsNone(crawl.headshot_person_name(label), label)

    def test_portrait_filter_keeps_only_photo_of_images(self):
        def image(name, url):
            return {'kind': 'image', 'name': name, 'candidate_url': url,
                    'source_url': 'https://example.com/about', 'review_required': True}
        rows = [image('Photo of Jane Smith', 'https://example.com/jane.jpg'),
                image('Example Co', 'https://example.com/logo.png'),
                image('Example headquarters in Palo Alto, California', 'https://example.com/hq.jpg'),
                image('Example unveils new platform', 'https://example.com/hero.jpg'),
                image('', 'https://example.com/blank.jpg'),
                {'kind': 'social', 'name': 'LinkedIn',
                 'candidate_url': 'https://www.linkedin.com/company/example',
                 'source_url': 'https://example.com/about', 'review_required': True}]
        kept, excluded = crawl.filter_portrait_headshots(rows)
        self.assertEqual(excluded, 4)
        self.assertEqual([row['kind'] for row in kept], ['image', 'social'])
        self.assertTrue(kept[0]['headshot'])
        self.assertEqual(kept[0]['person_name'], 'Jane Smith')
        self.assertNotIn('headshot', kept[1])

    def test_portrait_filter_psiquantum_shaped_page_yields_headshot_subset(self):
        # Shaped like PsiQuantum's /about page in crawl #46: a block of
        # 'Photo of <name>' team headshots mixed with facility photography.
        source = 'https://example.com/about'
        html = b'''<img alt="Example headquarters in Palo Alto, California" src="/hq.jpg">
        <img alt="Photo of Victor Peng" src="/victor.jpg">
        <img alt="Photo of Fariba Danesh" src="/fariba.jpg">
        <img alt="Aerial view of the site under construction" src="/aerial.jpg">
        <img alt="Photo of Dr. Pete Shadbolt" src="/pete.jpg">
        <img alt="Logo Placeholder" src="/logo.png">'''
        page = {'final_url': source, 'checked_at': '2026-11-23',
                **crawl.extract_page(html, source)}
        rows = crawl.extract_profile_media_leads('Example', page, 'about')
        kept, excluded = crawl.filter_portrait_headshots(rows)
        self.assertEqual(excluded, 3)
        self.assertEqual([row['person_name'] for row in kept],
                         ['Victor Peng', 'Fariba Danesh', 'Dr. Pete Shadbolt'])
        self.assertTrue(all(row['headshot'] for row in kept))

    def test_profile_headshot_binding_matches_photo_of_to_people_row(self):
        source = 'https://example.com/team'
        people = {'partner': 'Example', 'kind': 'people', 'name': 'Jane Smith',
                  'candidate_url': 'https://example.com/team/jane-smith',
                  'source_url': source, 'review_required': True}
        image = {'partner': 'Example', 'kind': 'image', 'name': 'Photo of Jane Smith',
                 'candidate_url': 'https://example.com/jane.jpg',
                 'source_url': source, 'review_required': True}
        bindings = crawl.bind_profile_headshot_candidates([people, image])
        self.assertEqual(bindings, 1)
        candidate = people['headshot_candidate']
        self.assertEqual(candidate['candidate_url'], 'https://example.com/jane.jpg')
        self.assertEqual(candidate['status'], 'not_fetched')
        self.assertTrue(candidate['review_required'])
        self.assertEqual(candidate['reason'], 'Rights and image review required')
        self.assertEqual(image['person_name'], 'Jane Smith')
        self.assertEqual(image['bound_person'], 'Jane Smith')

    def test_profile_headshot_binding_requires_same_page_and_person_alt(self):
        source = 'https://example.com/team'
        people = {'partner': 'Example', 'kind': 'people', 'name': 'Jane Smith',
                  'candidate_url': 'https://example.com/team/jane-smith',
                  'source_url': source, 'review_required': True}
        other_page = {'partner': 'Example', 'kind': 'image',
                      'name': 'Photo of Jane Smith',
                      'candidate_url': 'https://example.com/jane.jpg',
                      'source_url': 'https://example.com/about',
                      'review_required': True}
        not_a_person = {'partner': 'Example', 'kind': 'image',
                        'name': 'Photo of the team',
                        'candidate_url': 'https://example.com/team.jpg',
                        'source_url': source, 'review_required': True}
        bindings = crawl.bind_profile_headshot_candidates(
            [people, other_page, not_a_person])
        self.assertEqual(bindings, 0)
        self.assertNotIn('headshot_candidate', people)

    def test_profile_team_name_headshots_replay_saved_examples(self):
        fixture = Path(__file__).parent / 'fixtures/team-image-name-crawl-46.json'
        rows = json.loads(fixture.read_text())['candidates']
        self.assertEqual(crawl.bind_profile_headshot_candidates(rows), 3)
        for row in (item for item in rows if item['kind'] == 'people'):
            self.assertEqual(row['headshot_candidate']['binding_evidence'],
                             'team-alt-and-profile-slug')
            self.assertEqual(row['headshot_candidate']['status'], 'not_fetched')
            self.assertTrue(row['headshot_candidate']['review_required'])

    def test_profile_team_name_headshot_requires_unambiguous_local_evidence(self):
        source = 'https://example.com/team'
        person = {'partner': 'Example', 'kind': 'people', 'name': 'Jane Smith',
                  'candidate_url': source + '/jane-smith', 'source_url': source}
        image = {'partner': 'Example', 'kind': 'image', 'page_kind': 'people',
                 'name': 'Jane Smith', 'candidate_url': 'https://example.com/jane.jpg',
                 'source_url': source}
        cases = [
            [{**image, 'page_kind': 'homepage'}],
            [{**image, 'source_url': 'https://example.com/about'}],
            [{**image, 'partner': 'Other'}],
            [{**image, 'label_distinct_image_paths': 2}],
            [image, {**image, 'candidate_url': image['candidate_url'] + '?v=2'}],
            [image, {**image, 'name': 'Alice Smith'}],
            [image, {**person, 'candidate_url': source + '/second-jane-smith'}],
        ]
        for images in cases:
            with self.subTest(images=images):
                target = person.copy()
                self.assertEqual(crawl.bind_profile_headshot_candidates(
                    [target, *(row.copy() for row in images)]), 0)
                self.assertNotIn('headshot_candidate', target)
        for url in ('https://other.example/team/jane-smith', source + '/alice-smith'):
            self.assertEqual(crawl.bind_profile_headshot_candidates(
                [{**person, 'candidate_url': url}, image.copy()]), 0)
        explicit = {**image, 'name': 'Photo of Jane Smith',
                    'candidate_url': 'https://example.com/explicit.jpg'}
        self.assertEqual(crawl.bind_profile_headshot_candidates(
            [person, image.copy(), explicit]), 1)
        self.assertEqual(person['headshot_candidate']['binding_evidence'],
                         'explicit-photo-alt')

    def test_profile_headshot_binding_asset_host_eligibility(self):
        source = 'https://example.com/team'
        def rows(host):
            people = {'partner': 'Example', 'kind': 'people', 'name': 'Jane Smith',
                      'candidate_url': 'https://example.com/team/jane-smith',
                      'source_url': source, 'review_required': True}
            image = {'partner': 'Example', 'kind': 'image',
                     'name': 'Photo of Jane Smith',
                     'candidate_url': f'https://{host}/jane.jpg',
                     'source_url': source, 'review_required': True}
            return people, image
        people, image = rows('images.squarespace-cdn.com')
        crawl.bind_profile_headshot_candidates(
            [people, image], {'Example': ['images.squarespace-cdn.com']})
        self.assertEqual(people['headshot_candidate']['reason'],
                         'Rights and image review required')
        people, image = rows('images.squarespace-cdn.com')
        crawl.bind_profile_headshot_candidates([people, image])
        self.assertEqual(people['headshot_candidate']['reason'],
                         'External asset host requires separate review')

    def test_company_profile_seeds_carry_psiquantum_asset_hosts(self):
        seeds = crawl.load_approved_csv(
            crawl.ROOT / 'data/company-profile-seeds.csv', {'PsiQuantum'},
            require_qid=False)
        self.assertEqual(len(seeds), 1)
        self.assertIn('static1.squarespace.com', seeds[0]['asset_hosts'])
        self.assertIn('images.squarespace-cdn.com', seeds[0]['asset_hosts'])

    def test_approved_asset_host_rejects_urls_and_local_names(self):
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'review.csv'
            for host in ('https://cdn.example.com/x','cdn.example.com:443','localhost','127.0.0.1'):
                path.write_text('partner,qid,official_website,approved,asset_hosts\nAIR,Q42,https://example.com/,yes,'+host+'\n')
                with self.assertRaises(crawl.CrawlError): crawl.load_approved_csv(path,{'AIR'})

    def test_reviewed_site_seed_may_omit_qid_but_import_must_not(self):
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'review.csv'
            path.write_text(chr(10).join(['partner,qid,official_website,approved','AIR,,https://example.com/,yes','']))
            self.assertEqual(crawl.load_approved_csv(path,{'AIR'},require_qid=False)[0]['url'],'https://example.com/')
            with self.assertRaises(crawl.CrawlError): crawl.load_approved_csv(path,{'AIR'})
            with self.assertRaises(crawl.CrawlError): crawl.load_approved_csv(path,{'Other'},require_qid=False)

    def test_untrusted_csv_cells_cannot_become_spreadsheet_formulas(self):
        for value in ('=1+1',' +cmd','@sum(A1:A2)','-1+2','\ttext'):
            self.assertTrue(crawl.csv_safe(value).startswith("'"))
        self.assertEqual(crawl.csv_safe('ordinary startup'),'ordinary startup')

    def test_sites_crawls_extra_sources_and_follows_links(self):
        class Fake:
            delay=1
            def request(self,url,*args,**kwargs):
                if url.endswith('/robots.txt'): return 200,{},b'User-agent: *\nDisallow: /blocked\n',url
                return 200,{'Content-Type':'text/html'},b'<title>Program</title><a href="/blocked">Eligibility</a>',url
        catalogue={'opportunities':[{'id':'one','name':'One','url':'https://example.com/start','extra':['https://example.com/terms']}], 'partnerLeads':[]}
        args=types.SimpleNamespace(only=[],approved=None,limit=0,follow=1,partners_only=False)
        result=crawl.crawl_sites(catalogue,args,Fake())['results'][0]['pages']
        self.assertEqual([p['status'] for p in result],['ok','ok','ok'])
        self.assertEqual(result[2]['url'],'https://example.com/blocked')
    def test_program_discovery_keeps_candidates_unapproved(self):
        class Fake:
            delay=1
            def request(self,url,*args,**kwargs):
                if url.endswith('/robots.txt'): return 404,{},b'',url
                return 200,{'Content-Type':'text/html'},b'<li><a href="/founder-program"><h3>Founder Program</h3></a><p>For seed founders.</p></li>',url
        registry={'sources':[{'id':'one','name':'Official directory','url':'https://example.com/programs','scope':'Australia'}]}
        args=types.SimpleNamespace(only=[],approved=None,limit=0,follow=0,partners_only=False)
        result=crawl.crawl_program_directories(registry,args,Fake())
        candidate=result['candidates'][0]
        self.assertEqual(candidate['label'],'Founder Program')
        self.assertEqual(candidate['source_scope'],'Australia')
        self.assertTrue(candidate['review_required'])
    def test_program_discovery_preserves_each_source_and_page_observation(self):
        class Fake:
            def __init__(self): self.calls=[]
            def request(self,url,allowed_host=None,**kwargs):
                self.calls.append((url,allowed_host))
                html=b'<a href="https://program.example/startup#one">Founder Program</a><a href="https://program.example/startup#two">Founder Program</a>'
                if url.endswith('/national'):
                    html+=b'<a href="/eligibility">Eligibility</a>'
                return 200,{'Content-Type':'text/html'},html,url
        registry={'sources':[
            {'id':'national','name':'Directory','url':'https://example.com/national','scope':'Australia'},
            {'id':'regional','name':'Directory','url':'https://example.com/regional','scope':'Victoria'},
        ]}
        args=types.SimpleNamespace(only=[],approved=None,limit=0,follow=1,partners_only=False)
        transport=Fake()
        with patch.object(crawl,'utc_now',return_value='2026-11-17T03:00:00+00:00'):
            result=crawl.crawl_program_directories(registry,args,transport)
        observations=result['candidates']
        self.assertEqual([(c['source_id'],c['source_url'],c['source_scope']) for c in observations],[
            ('national','https://example.com/national','Australia'),
            ('national','https://example.com/eligibility','Australia'),
            ('regional','https://example.com/regional','Victoria'),
        ])
        self.assertTrue(all(c['checked_at']=='2026-11-17T03:00:00+00:00' for c in observations))
        self.assertTrue(all(c['review_required'] and 'eligibility' not in c for c in observations))
        self.assertEqual(transport.calls,[
            ('https://example.com/national','example.com'),
            ('https://example.com/eligibility','example.com'),
            ('https://example.com/regional','example.com'),
        ])
        self.assertEqual([s['observed_candidates'] for s in result['coverage']['sources']],[2,1])
        self.assertEqual(result['coverage']['observed_candidates'],3)
        with tempfile.TemporaryDirectory() as tmp:
            review=Path(tmp)/'programs.csv'
            crawl.write_program_review_csv(review,result)
            with review.open(newline='') as handle: rows=list(csv.DictReader(handle))
        self.assertEqual([(r['source_id'],r['source_url'],r['checked_at']) for r in rows],
                         [(c['source_id'],c['source_url'],c['checked_at']) for c in observations])
        self.assertTrue(all(r['approved']=='' for r in rows))

    def test_program_coverage_distinguishes_failed_from_empty_success_and_partial(self):
        class Fake:
            def __init__(self): self.calls=[]
            def request(self,url,*args,**kwargs):
                self.calls.append(url)
                if url.endswith('/failed'): raise crawl.CrawlError('DNS lookup failed')
                if url.endswith('/partial'):
                    return 200,{},b'<a href="/failed">Eligibility</a>',url
                return 200,{},b'<main>No relevant links in this response</main>',url
        registry={'sources':[{'id':name,'name':name,'url':'https://example.com/'+name,'scope':'Unknown'}
                             for name in ('empty','failed','partial')]}
        args=types.SimpleNamespace(only=[],approved=None,limit=0,follow=1,partners_only=False)
        transport=Fake(); result=crawl.crawl_program_directories(registry,args,transport)
        self.assertEqual(result['candidates'],[])
        report=result['coverage']
        self.assertEqual(report['fetch_status'],'partial')
        self.assertEqual([s['fetch_status'] for s in report['sources']],['all_succeeded','none_succeeded','partial'])
        self.assertEqual(transport.calls,['https://example.com/empty','https://example.com/failed','https://example.com/partial'])
        self.assertEqual(report['pages_attempted'],3)
        self.assertEqual(report['pages_succeeded'],2)
        self.assertEqual(report['pages_skipped_or_failed'],1)
        self.assertEqual(report['page_observations'],4)
        self.assertEqual(report['reused_page_observations'],1)
        self.assertEqual(report['sources'][2]['failed_page_observations'],1)
        self.assertEqual(report['returned_candidates'],0)
        self.assertFalse(report['truncated'])
        self.assertNotIn('no programmes',report['note'].lower())

    def test_program_coverage_reports_cap_and_omitted_source_observations(self):
        sources=[{'id':str(n),'name':'Same display name','url':f'https://example.com/{n}','scope':'Unknown'} for n in range(5)]
        rows=[{**s,'pages':[{'status':'ok','url':s['url'],'final_url':s['url'],'checked_at':'2026-11-17T03:00:00Z',
                            'links':[{'text':f'Founder Program {n}','url':f'https://program.example/{n}'} for n in range(250)]}]} for s in sources]
        with patch.object(crawl,'crawl_sites',return_value={'results':rows}):
            result=crawl.crawl_program_directories({'sources':sources},object(),object())
        report=result['coverage']
        self.assertEqual(len(result['candidates']),1000)
        self.assertEqual(report['observed_candidates'],1250)
        self.assertEqual(report['returned_candidates'],1000)
        self.assertEqual(report['unreviewed_candidates'],1000)
        self.assertEqual(report['omitted_candidates'],250)
        self.assertEqual(report['candidate_limit'],1000)
        self.assertTrue(report['truncated'])
        self.assertEqual([s['observed_candidates'] for s in report['sources']],[250]*5)
        self.assertEqual([s['returned_candidates'] for s in report['sources']],[250]*4+[0])
        self.assertEqual([s['omitted_candidates'] for s in report['sources']],[0]*4+[250])
        with patch.object(crawl,'crawl_sites',return_value={'results':rows[:4]}):
            boundary=crawl.crawl_program_directories({'sources':sources[:4]},object(),object())
        self.assertFalse(boundary['coverage']['truncated'])

    def test_program_shared_page_retains_source_attribution_but_counts_one_fetch(self):
        class Fake:
            def __init__(self): self.calls=[]
            def request(self,url,*args,**kwargs):
                self.calls.append(url)
                return 200,{},b'<a href="/founder-program">Founder Program</a>',url
        registry={'sources':[{'id':name,'name':name,'url':'https://example.com/directory','scope':name}
                             for name in ('national','regional')]}
        args=types.SimpleNamespace(only=[],approved=None,limit=0,follow=0,partners_only=False)
        transport=Fake(); result=crawl.crawl_program_directories(registry,args,transport)
        self.assertEqual(transport.calls,['https://example.com/directory'])
        self.assertEqual([c['source_id'] for c in result['candidates']],['national','regional'])
        self.assertEqual(result['coverage']['pages_attempted'],1)
        self.assertEqual(result['coverage']['pages_succeeded'],1)
        self.assertEqual(result['coverage']['page_observations'],2)
        self.assertEqual(result['coverage']['reused_page_observations'],1)
        self.assertEqual(result['coverage']['sources'][1]['new_fetch_attempts'],0)
        self.assertEqual(result['coverage']['sources'][1]['successful_page_observations'],1)

    def test_named_heading_link_uses_following_programme_description(self):
        class Fake:
            delay=1
            def request(self,url,*args,**kwargs):
                if url.endswith('/robots.txt'): return 404,{},b'',url
                html=b'<h3><a href="https://health.example/">ANDHealth</a></h3><p>ACTIVATE is a six-month accelerator for Victorian health startups.</p>'
                return 200,{'Content-Type':'text/html'},html,url
        registry={'sources':[{'id':'one','name':'Official directory','url':'https://example.com/programs','scope':'Australia'}]}
        args=types.SimpleNamespace(only=[],approved=None,limit=0,follow=0,partners_only=False)
        result=crawl.crawl_program_directories(registry,args,Fake())
        self.assertEqual(result['candidates'][0]['label'],'ANDHealth')
        self.assertIn('accelerator',result['candidates'][0]['context'])
        self.assertEqual(result['candidates'][0]['program_url'],'https://health.example/')
    def test_discovery_keeps_ambiguous_candidates_unverified(self):
        responses=[{'search':[{'id':'Q42','label':'AIR','description':'an airline'}]}, {'entities':{'Q42':{'claims':{'P856':[{'mainsnak':{'datavalue':{'value':'https://example.com'}},'rank':'normal'}]}}}}]
        args=types.SimpleNamespace(partner=None,limit=0,candidates=5)
        with patch.object(crawl,'api_json',side_effect=responses):
            result=crawl.discover({'partnerLeads':['AIR']},args,object())
        self.assertIn('unverified',result['warning'].lower())
        candidate=result['results'][0]['candidates'][0]
        self.assertEqual(candidate['properties']['official_website'],['https://example.com'])
        self.assertNotIn('approved',candidate)
    def test_discovery_splits_oversized_entity_batches(self):
        responses=[{'search':[{'id':'Q1','label':'A'}, {'id':'Q2','label':'B'}]},
                   crawl.CrawlError('response exceeds size limit'),
                   {'entities':{'Q1':{'claims':{}}}}, {'entities':{'Q2':{'claims':{}}}}]
        args=types.SimpleNamespace(partner=None,limit=0,candidates=5)
        with patch.object(crawl,'api_json',side_effect=responses) as api:
            result=crawl.discover({'partnerLeads':['AIR']},args,object())
        self.assertEqual(len(result['results'][0]['candidates']),2)
        self.assertEqual(api.call_count,4)
    def test_review_requires_explicit_selection_and_rejects_duplicates(self):
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'review.csv'
            with path.open('w',newline='') as f:
                w=csv.DictWriter(f,fieldnames=['partner','qid','official_website','description','approved']);w.writeheader()
                w.writerow({'partner':'AIR','qid':'Q42','official_website':'https://example.com','description':'A candidate','approved':''})
            self.assertEqual(crawl.load_approved_csv(path,{'AIR'}),[])
            with path.open('a',newline='') as f:
                w=csv.DictWriter(f,fieldnames=['partner','qid','official_website','description','approved']);w.writerow({'partner':'AIR','qid':'Q42','official_website':'https://example.com','approved':'yes'})
            self.assertEqual(crawl.load_approved_csv(path,{'AIR'})[0]['qid'],'Q42')
            with path.open('a',newline='') as f:
                w=csv.DictWriter(f,fieldnames=['partner','qid','official_website','description','approved']);w.writerow({'partner':'AIR','qid':'Q43','official_website':'https://other.com','approved':'yes'})
            with self.assertRaises(crawl.CrawlError): crawl.load_approved_csv(path,{'AIR'})
    def test_import_preserves_existing_reviewed_records_and_uses_matching_snapshot(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp); (root/'data').mkdir()
            (root/'data/catalogue.json').write_text(json.dumps({'partnerLeads':['AIR','Acrew'],'opportunities':[]}))
            (root/'data/partners-reviewed.json').write_text(json.dumps({'Acrew':{'website':'https://acrew.example','description':'existing'}}))
            review=root/'review.csv'
            review.write_text('partner,qid,official_website,description,approved\nAIR,Q42,https://example.com,manual description,yes\n')
            snapshot=root/'sites.json'
            snapshot.write_text(json.dumps({'results':[{'id':'partner:Q42','name':'AIR','url':'https://example.com','pages':[{'status':'ok','url':'https://example.com','final_url':'https://example.com/','checked_at':'2026-11-11','metadata':{'description':'site description'}}]}]}))
            with patch.object(crawl,'ROOT',root), patch.object(crawl,'CATALOGUE',root/'data/catalogue.json'):
                self.assertEqual(crawl.main(['apply-reviewed','--approved',str(review),'--snapshot',str(snapshot),'--out',str(root/'out')]),0)
            saved=json.loads((root/'data/partners-reviewed.json').read_text())
            self.assertEqual(saved['Acrew']['description'],'existing')
            self.assertEqual(saved['AIR']['site_description'],'site description')
            self.assertEqual(saved['AIR']['source'],'https://www.wikidata.org/wiki/Q42')

if __name__=='__main__': unittest.main()
