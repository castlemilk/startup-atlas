import { createTable, getCoreRowModel, getSortedRowModel, getPaginationRowModel } from '@tanstack/table-core';
import { filterOpportunities } from './logic.js';

// Keep the catalogue's explicit eligibility logic; let TanStack own the
// visible row model and its sorting/paging without changing the article UI.
export function opportunityRows(items, state, saved, visible) {
  const filtered=filterOpportunities(items,{...state,sort:'recommended'},saved);
  const table=createTable({
    data:filtered,
    columns:[{id:'name',accessorFn:item=>item.name,sortingFn:(a,b,id)=>a.getValue(id).localeCompare(b.getValue(id))}],
    state:{sorting:state.sort==='name'?[{id:'name',desc:false}]:[],pagination:{pageIndex:0,pageSize:visible}},
    onStateChange:()=>{},renderFallbackValue:null,
    getCoreRowModel:getCoreRowModel(),getSortedRowModel:getSortedRowModel(),getPaginationRowModel:getPaginationRowModel()
  });
  return {total:table.getPrePaginationRowModel().rows.length,rows:table.getRowModel().rows.map(row=>row.original)};
}
