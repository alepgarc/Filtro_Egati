/**
 * Standardized File Naming for EPR Paraná App
 * Pattern: "Parcial {N}_{Area}_{Rodovia}.{ext}"
 *
 * Example: "Parcial 1_DrenSuperficial_BR-369.pdf" / ".xlsx"
 */

export function extractCleanRodoviaName(rodovia: string | null | undefined): string {
  if (!rodovia) return 'Geral';
  const trimmed = rodovia.trim();
  if (!trimmed || trimmed.toLowerCase().includes('todas') || trimmed.toLowerCase() === 'geral') {
    return 'Geral';
  }

  // Look for highway code e.g. BR-369, PR-445, BR/369, PR 323, etc.
  const match = trimmed.match(/\b([A-Za-z]{2})[\s\/\-_]?(\d{2,4})\b/);
  if (match) {
    return `${match[1].toUpperCase()}-${match[2]}`;
  }

  return trimmed
    .replace(/[\/\\:*?"<>|\r\n]/g, '-')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^-+|-+$/g, '');
}

export function getAreaIdentifier(
  featureType: string,
  sheetName?: string
): string | null {
  switch (featureType) {
    case 'drenagem_superficial':
      return '_DrenSuperficial_';
    case 'drenagem_profunda':
      return '_DrenProfunda_';
    case 'sinalizacao_horizontal_dispositivo':
      return '_SinHoriz_Dispositivo_';
    case 'sinalizacao_horizontal_marca_viaria':
      return '_SinHoriz_MarcaViaria_';
    case 'sinalizacao_horizontal_zebrado':
      return '_SinHoriz_Zebrado_';
    case 'sinalizacao_vertical':
      return '_SinVertical_';
    case 'eps_defensa': {
      const s = (sheetName || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
      if (s.includes('barreira') || s.includes('concreto')) {
        return '_EPS_BarrConcreto_';
      }
      if (s.includes('metalica')) {
        return '_EPS_DefensaMetalica_';
      }
      if (s.includes('oea') || s.includes('oae')) {
        return '_EPS_Defensa OEA_';
      }
      return '_EPS_Defensa_';
    }
    default:
      return null;
  }
}

export function buildStandardFileName(params: {
  parcialNumber?: number | string | null;
  featureType: string;
  sheetName?: string;
  rodoviaFilter?: string | null;
  extension?: 'xlsx' | 'pdf' | 'xls';
  fallbackOriginalName?: string;
  estadoConservacaoFilter?: string | null;
}): string {
  const {
    parcialNumber,
    featureType,
    sheetName,
    rodoviaFilter,
    extension = 'xlsx',
    fallbackOriginalName,
    estadoConservacaoFilter,
  } = params;

  const rawNum =
    parcialNumber !== undefined && parcialNumber !== null
      ? String(parcialNumber).replace(/\D/g, '')
      : '1';
  const num = rawNum || '1';
  const parcialPart = `Parcial ${num}`;
  const areaPart = getAreaIdentifier(featureType, sheetName);
  const rodoviaPart = extractCleanRodoviaName(rodoviaFilter);

  if (areaPart) {
    return `${parcialPart}${areaPart}${rodoviaPart}.${extension}`;
  }

  // Fallback to legacy format if not mapped
  const baseName = fallbackOriginalName
    ? fallbackOriginalName.replace(/\.[^/.]+$/, '')
    : 'planilha_filtrada';
  const safeRodovia = rodoviaFilter ? rodoviaFilter.replace(/[\/\\:*?"<>|]/g, '-').trim() : '';
  const safeEstado = estadoConservacaoFilter
    ? estadoConservacaoFilter.replace(/[\/\\:*?"<>|]/g, '-').trim()
    : '';

  let suffix = '_filtrada';
  if (safeRodovia && safeEstado) {
    suffix = `_${safeRodovia}_${safeEstado}`;
  } else if (safeRodovia) {
    suffix = `_${safeRodovia}`;
  } else if (safeEstado) {
    suffix = `_${safeEstado}`;
  }

  return `${baseName}${suffix}.${extension}`;
}
