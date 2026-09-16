const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

const realXlsPath = '/tmp/xlsx_cleaner/uploads/1789564578427-791333236-EPRParana_SinalizacaoHorizontal_Dispositivo_EntregaParcial4.xls';

// Let's test what happens when convertXlsToXlsxWithImages is called and then processWorkbookWithZip is called on it
async function test() {
  console.log('Testing pipeline on real .xls file...');
}

test();
