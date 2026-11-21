import {read,utils,SSF} from 'xlsx';
import {tableFromGrid} from './import-data';

export function legacyTables(bytes:ArrayBuffer){
 const workbook=read(bytes,{type:'array',cellNF:true,cellHTML:false,cellFormula:false});
 const tables=[];
 for(const name of workbook.SheetNames){
  const sheet=workbook.Sheets[name];
  if(!sheet['!ref'])continue;
  const range=utils.decode_range(sheet['!ref']);
  if(range.e.r-range.s.r<1)continue;
  if(range.e.c-range.s.c>=500||range.e.r-range.s.r>250000)throw Error('Worksheet exceeds the row or column limit.');
  const grid=utils.sheet_to_json<unknown[]>(sheet,{header:1,raw:true,blankrows:true});
  for(let r=0;r<grid.length;r++)for(let c=0;c<grid[r].length;c++){
   const cell=sheet[utils.encode_cell({r:r+range.s.r,c:c+range.s.c})];
   if(cell?.t!=='n'||typeof cell.z!=='string')continue;
   if(SSF.is_date(cell.z)){
    const date=SSF.parse_date_code(cell.v,{date1904:!!workbook.Workbook?.WBProps?.date1904});
    if(date)grid[r][c]=[date.y,String(date.m).padStart(2,'0'),String(date.d).padStart(2,'0')].join('-');
   }else if(/^0+$/.test(cell.z))grid[r][c]=String(cell.v).padStart(cell.z.length,'0');
  }
  const filled=grid.filter(row=>row.some(value=>value!==''&&value!=null));
  if(filled.length>1)tables.push(tableFromGrid(name,filled));
 }
 return tables;
}
