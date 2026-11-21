import { Avatar, Row, Stage, Text, Window } from '../../kit'
import './stage.css'

const companies = [
  ['Alloovium', 'AI & machine learning', './assets/alloovium.png'],
  ['Bugcrowd', 'Cybersecurity', ''],
  ['Canva', 'Design & media', ''],
  ['Culture Amp', 'Business software', './assets/culture-amp.svg'],
]
const founders = ['Cameron Adams', 'Cliff Obrecht', 'Melanie Perkins']

export default function AtlasLanding() {
  return (
    <Stage
      width={660}
      height={406}
      compact={{ below: 620, width: 358, height: 272 }}
      className="atlas-stage"
      accent="#a84121"
      tokens={{ '--ss-text-strong': '#122b22', '--ss-text': '#525f55', '--ss-font': 'Atlas Inter, sans-serif' }}
    >
      {(_, __, layout) => (
        <>
          <Window className="atlas-stage-list" url="Startup Atlas" chrome="hairline">
            <div className="atlas-stage-header">
              <Text className="atlas-stage-title">Companies</Text>
              {layout === 'wide' && <span className="atlas-stage-views"><b>List</b>Graph&nbsp; · &nbsp;Treemap</span>}
            </div>
            <div className="atlas-stage-column-head"><span>Company</span>{layout === 'wide' && <span>Technology type</span>}</div>
            {companies.slice(0, layout === 'compact' ? 3 : undefined).map(([name, technology, logo]) => (
              <Row
                key={name}
                pad={10}
                selected={name === 'Canva'}
                className="atlas-stage-row"
                lead={<Avatar name={name} size={30} tone="ink" className={logo ? 'atlas-stage-logo' : undefined} src={logo ? new URL(logo, import.meta.url).href : undefined} />}
                title={<Text>{name}</Text>}
              >
                {layout === 'wide' && <Text className="atlas-stage-technology">{technology}</Text>}
              </Row>
            ))}
          </Window>
          <section className="atlas-stage-inspector">
            <Text className="atlas-stage-selected">Canva</Text>
            <Text className="atlas-stage-type">Design &amp; media</Text>
            <div className="atlas-stage-founders">
              <Text className="atlas-stage-founders-label">Founders</Text>
              <ul>{founders.map(name => <li key={name}>{name}</li>)}</ul>
            </div>
          </section>
        </>
      )}
    </Stage>
  )
}
