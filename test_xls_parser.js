const fs = require('fs');
const sharp = require('sharp');
const XLSX = require('xlsx');

const xlsPath = '/tmp/xlsx_cleaner/uploads/1789564578427-791333236-EPRParana_SinalizacaoHorizontal_Dispositivo_EntregaParcial4.xls';
const buf = fs.readFileSync(xlsPath);

async function getJpegs() {
  const jpegs = [];
  let pos = 0;
  while (pos < buf.length - 4) {
    if (buf[pos] === 0xFF && buf[pos + 1] === 0xD8 && buf[pos + 2] === 0xFF) {
      let end = pos + 3;
      let foundValid = false;
      while (end < buf.length - 1) {
        if (buf[end] === 0xFF && buf[end + 1] === 0xD9) {
          const candidate = buf.subarray(pos, end + 2);
          if (candidate.length > 500) {
            try {
              const meta = await sharp(candidate).metadata();
              if (meta && meta.width && meta.height && meta.width > 10 && meta.height > 10) {
                jpegs.push({ pos, buf: candidate, width: meta.width, height: meta.height });
                pos = end + 2;
                foundValid = true;
                break;
              }
            } catch (e) {}
          }
        }
        end++;
      }
      if (foundValid) continue;
    }
    pos++;
  }
  return jpegs;
}

async function run() {
  const jpegs = await getJpegs();
  console.log('Total JPEGs:', jpegs.length);

  // Parse SpContainers (0xF00A)
  let pos = 0;
  const pictureMappings = [];

  while (pos < buf.length - 8) {
    if (buf[pos + 2] === 0x0A && buf[pos + 3] === 0xF0) {
      const recLen = buf.readUInt32LE(pos + 4);
      if (recLen > 0 && pos + 8 + recLen <= buf.length) {
        const spBuf = buf.subarray(pos + 8, pos + 8 + recLen);

        let anchor = null;
        let blipId = null;

        for (let i = 0; i < spBuf.length - 8; i++) {
          if (spBuf[i + 2] === 0x10 && spBuf[i + 3] === 0xF0) {
            const aLen = spBuf.readUInt32LE(i + 4);
            if (aLen >= 18 && i + 8 + aLen <= spBuf.length) {
              const aPay = spBuf.subarray(i + 8, i + 8 + aLen);
              anchor = {
                col1: aPay.readUInt16LE(2),
                row1: aPay.readUInt16LE(6),
                col2: aPay.readUInt16LE(10),
                row2: aPay.readUInt16LE(14)
              };
            }
          }
          if (spBuf[i + 2] === 0x0B && spBuf[i + 3] === 0xF0) {
            const optLen = spBuf.readUInt32LE(i + 4);
            const inst = (spBuf.readUInt16LE(i) >> 4) & 0xFFF;
            if (optLen > 0 && i + 8 + optLen <= spBuf.length) {
              const optPay = spBuf.subarray(i + 8, i + 8 + optLen);
              let pPos = 0;
              for (let p = 0; p < inst && pPos + 6 <= optPay.length; p++) {
                const propId = optPay.readUInt16LE(pPos);
                const propVal = optPay.readUInt32LE(pPos + 2);
                if ((propId & 0x3FFF) === 0x0104) {
                  blipId = propVal;
                }
                pPos += 6;
              }
            }
          }
        }

        if (anchor && anchor.row1 < 10000 && anchor.col1 < 500) {
          pictureMappings.push({ anchor, blipId });
        }
      }
    }
    pos++;
  }

  console.log('Total pictures with anchor:', pictureMappings.length);
  for (let i = 0; i < Math.min(25, pictureMappings.length); i++) {
    const p = pictureMappings[i];
    console.log(`Picture ${i}: blipId=${p.blipId}, row=${p.anchor.row1 + 1}, col=${p.anchor.col1 + 1}`);
  }
}

run();
