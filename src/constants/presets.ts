import { DrainageFeatureType } from '../types';

export interface DrainageFeatureConfig {
  id: DrainageFeatureType;
  name: string;
  tagline: string;
  description: string;
  fields: readonly string[];
}

export const DRENAGEM_PROFUNDA_FIELDS = [
  'codAuto',
  'km',
  'Rodovia',
  'Sentido',
  'TipoMontante',
  'sigla',
  'Limpeza.',
  'CaixaDanificada.',
  'TampaDanificada/Inxistente',
  'EstadoConservacao',
  'Foto1',
  'Foto2',
  'Foto3',
  'Foto4',
  'Foto5',
  'Foto6',
  'Foto7',
  'Foto8',
  'Foto9',
  'Foto10',
  'Foto11',
  'Foto12',
  'Foto13',
  'Foto14',
  'Foto15',
] as const;

export const DRENAGEM_PROFUNDA_TURBO_FIELDS = [
  'codAuto',
  'km',
  'Rodovia',
  'Sentido',
  'TipoMontante',
  'sigla',
  'Limpeza.',
  'CaixaDanificada.',
  'TampaDanificada/Inxistente',
  'EstadoConservacao',
  'Foto1',
  'Foto2',
  'Foto3',
  'Foto4',
] as const;

export const DRENAGEM_SUPERFICIAL_FIELDS = [
  'codAuto',
  'Elemento',
  'km',
  'Rodovia',
  'Sentido',
  'ExtensaoReparar',
  'ExtensaoLimpeza',
  'EstadoConservacao',
  'Foto1',
  'Foto2',
  'Foto3',
  'Foto4',
  'Foto5',
  'Foto6',
  'Foto7',
  'Foto8',
  'Foto9',
  'Foto10',
  'Foto11',
  'Foto12',
  'Foto13',
  'Foto14',
  'Foto15',
] as const;

export const DRENAGEM_SUPERFICIAL_TURBO_FIELDS = [
  'codAuto',
  'Elemento',
  'km',
  'Rodovia',
  'Sentido',
  'ExtensaoReparar',
  'ExtensaoLimpeza',
  'EstadoConservacao',
  'Foto1',
  'Foto2',
  'Foto3',
  'Foto4',
] as const;

export const SINALIZACAO_VERTICAL_FIELDS = [
  'codAuto',
  'rodovia',
  'sentido',
  'km',
  'posicao',
  'localizacao',
  'lado',
  'codigoTipo',
  'materialSuporte',
  'largura',
  'altura',
  'metro2',
  'foto1',
  'foto2',
  'foto3',
  'foto4',
  'foto5',
  'foto6',
  'foto7',
  'Situação Retrorrefletancia',
] as const;

export const SINALIZACAO_HORIZONTAL_DISPOSITIVO_FIELDS = [
  'CodAuto',
  'TipoHorizontal',
  'Localização',
  'Rodovia',
  'Km',
  'Sentido',
  'Bordo',
  'Cor',
  'Resultado Geral',
  'Foto 1',
  'Foto 2',
  'Foto 3',
  'Foto 4',
  'Foto 5',
] as const;

export const SINALIZACAO_HORIZONTAL_MARCA_VIARIA_FIELDS = [
  'CodAuto',
  'Localização',
  'Rodovia',
  'Km',
  'Sentido',
  'TipoHorizontal',
  'Tipo',
  'Cor',
  'Foto 1',
  'Foto 2',
  'Foto 3',
  'Foto 4',
  'Foto 5',
  'Resultado',
] as const;

export const SINALIZACAO_HORIZONTAL_ZEBRADO_FIELDS = [
  'codAuto',
  'tipoHorizontal',
  'localizacao',
  'rodovia',
  'km',
  'sentido',
  'cor',
  'resultadoGeral',
  'foto1',
  'foto2',
  'foto3',
  'foto4',
  'foto5',
] as const;

export const EPS_DEFENSA_FIELDS = [
  'codAuto',
  'km',
  'kmFinal',
  'sentido',
  'tipoDefensa',
  'rodovia',
  'lado',
  'observacao',
  'aparenciaGeral',
  'Foto1',
  'Foto2',
  'Foto3',
  'Foto4',
] as const;

export const APARENCIA_GERAL_OPTIONS = [
  { value: '', label: 'Todas as aparências (sem filtro)' },
  { value: 'Ruim', label: 'Ruim' },
  { value: 'Regular', label: 'Regular' },
  { value: 'Boa', label: 'Boa' },
] as const;

export const DRAINAGE_FEATURES: Record<DrainageFeatureType, DrainageFeatureConfig> = {
  drenagem_profunda: {
    id: 'drenagem_profunda',
    name: 'Drenagem Profunda',
    tagline: 'Subterrânea / Caixas, Poços e Tampas',
    description:
      'Mantém colunas de sigla, tipo montante, caixas, tampas, limpeza, estado de conservação e fotos.',
    fields: DRENAGEM_PROFUNDA_FIELDS,
  },
  drenagem_superficial: {
    id: 'drenagem_superficial',
    name: 'Drenagem Superficial',
    tagline: 'Superfície / Sarjetas, Valetas e Extensões',
    description:
      'Mantém colunas de elemento, sentido, extensões a reparar/limpar, estado de conservação e fotos.',
    fields: DRENAGEM_SUPERFICIAL_FIELDS,
  },
  sinalizacao_vertical: {
    id: 'sinalizacao_vertical',
    name: 'Sinalização Vertical',
    tagline: 'Placas / Suportes, Dimensões e Retrorrefletância',
    description:
      'Mantém colunas de posição, localização, tipo, suporte, dimensões, fotos e situação de retrorrefletância.',
    fields: SINALIZACAO_VERTICAL_FIELDS,
  },
  sinalizacao_horizontal_dispositivo: {
    id: 'sinalizacao_horizontal_dispositivo',
    name: 'Sinalização Horizontal - Dispositivo',
    tagline: 'Tachas, Marcadores e Dispositivos Horizontais',
    description:
      'Mantém colunas de CodAuto, TipoHorizontal, Localização, Rodovia, Km, Sentido, Bordo, Cor, Resultado Geral e Fotos 1 a 5.',
    fields: SINALIZACAO_HORIZONTAL_DISPOSITIVO_FIELDS,
  },
  sinalizacao_horizontal_marca_viaria: {
    id: 'sinalizacao_horizontal_marca_viaria',
    name: 'Sinalização Horizontal - Marca Viária',
    tagline: 'Linhas, Faixas e Pinturas Viárias',
    description:
      'Mantém colunas de CodAuto, Localização, Rodovia, Km, Sentido, TipoHorizontal, Tipo, Cor, Fotos 1 a 5 e Resultado.',
    fields: SINALIZACAO_HORIZONTAL_MARCA_VIARIA_FIELDS,
  },
  sinalizacao_horizontal_zebrado: {
    id: 'sinalizacao_horizontal_zebrado',
    name: 'Sinalização Horizontal - Zebrado',
    tagline: 'Canalizações, Marcas de Canalização e Zebrados',
    description:
      'Mantém colunas de codAuto, tipoHorizontal, localizacao, rodovia, km, sentido, cor, resultadoGeral e fotos 1 a 5.',
    fields: SINALIZACAO_HORIZONTAL_ZEBRADO_FIELDS,
  },
  eps_defensa: {
    id: 'eps_defensa',
    name: 'EPS - Defensa',
    tagline: 'Barreira de Concreto, Defensa Metálica e OAE',
    description:
      'Mantém colunas de codAuto, km, kmFinal, sentido, tipoDefensa, rodovia, lado, observacao, aparenciaGeral, Foto1 a Foto4.',
    fields: EPS_DEFENSA_FIELDS,
  },
};

export const normalizeColKey = (str: string): string => {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
};

const profundaNormSet = new Set(
  DRENAGEM_PROFUNDA_FIELDS.map((f) => normalizeColKey(f))
);

const profundaTurboNormSet = new Set(
  DRENAGEM_PROFUNDA_TURBO_FIELDS.map((f) => normalizeColKey(f))
);

const superficialNormSet = new Set(
  DRENAGEM_SUPERFICIAL_FIELDS.map((f) => normalizeColKey(f))
);

const superficialTurboNormSet = new Set(
  DRENAGEM_SUPERFICIAL_TURBO_FIELDS.map((f) => normalizeColKey(f))
);

const sinalizacaoVerticalNormSet = new Set(
  SINALIZACAO_VERTICAL_FIELDS.map((f) => normalizeColKey(f))
);

const sinalizacaoHorizontalDispositivoNormSet = new Set(
  SINALIZACAO_HORIZONTAL_DISPOSITIVO_FIELDS.map((f) => normalizeColKey(f))
);

const sinalizacaoHorizontalMarcaViariaNormSet = new Set(
  SINALIZACAO_HORIZONTAL_MARCA_VIARIA_FIELDS.map((f) => normalizeColKey(f))
);

const sinalizacaoHorizontalZebradoNormSet = new Set(
  SINALIZACAO_HORIZONTAL_ZEBRADO_FIELDS.map((f) => normalizeColKey(f))
);

const epsDefensaNormSet = new Set(
  EPS_DEFENSA_FIELDS.map((f) => normalizeColKey(f))
);

export const isDefaultPresetField = (
  columnName: string,
  feature: DrainageFeatureType = 'drenagem_profunda',
  isTurbo: boolean = false
): boolean => {
  if (!columnName) return false;
  const trimmed = columnName.trim();

  let fields: readonly string[];
  let normSet: Set<string>;

  if (isTurbo) {
    switch (feature) {
      case 'eps_defensa':
        fields = EPS_DEFENSA_FIELDS;
        normSet = epsDefensaNormSet;
        break;
      case 'sinalizacao_vertical':
        fields = SINALIZACAO_VERTICAL_FIELDS;
        normSet = sinalizacaoVerticalNormSet;
        break;
      case 'drenagem_superficial':
        fields = DRENAGEM_SUPERFICIAL_TURBO_FIELDS;
        normSet = superficialTurboNormSet;
        break;
      case 'sinalizacao_horizontal_dispositivo':
        fields = SINALIZACAO_HORIZONTAL_DISPOSITIVO_FIELDS;
        normSet = sinalizacaoHorizontalDispositivoNormSet;
        break;
      case 'sinalizacao_horizontal_marca_viaria':
        fields = SINALIZACAO_HORIZONTAL_MARCA_VIARIA_FIELDS;
        normSet = sinalizacaoHorizontalMarcaViariaNormSet;
        break;
      case 'sinalizacao_horizontal_zebrado':
        fields = SINALIZACAO_HORIZONTAL_ZEBRADO_FIELDS;
        normSet = sinalizacaoHorizontalZebradoNormSet;
        break;
      case 'drenagem_profunda':
      default:
        fields = DRENAGEM_PROFUNDA_TURBO_FIELDS;
        normSet = profundaTurboNormSet;
        break;
    }
  } else {
    switch (feature) {
      case 'eps_defensa':
        fields = EPS_DEFENSA_FIELDS;
        normSet = epsDefensaNormSet;
        break;
      case 'sinalizacao_vertical':
        fields = SINALIZACAO_VERTICAL_FIELDS;
        normSet = sinalizacaoVerticalNormSet;
        break;
      case 'drenagem_superficial':
        fields = DRENAGEM_SUPERFICIAL_FIELDS;
        normSet = superficialNormSet;
        break;
      case 'sinalizacao_horizontal_dispositivo':
        fields = SINALIZACAO_HORIZONTAL_DISPOSITIVO_FIELDS;
        normSet = sinalizacaoHorizontalDispositivoNormSet;
        break;
      case 'sinalizacao_horizontal_marca_viaria':
        fields = SINALIZACAO_HORIZONTAL_MARCA_VIARIA_FIELDS;
        normSet = sinalizacaoHorizontalMarcaViariaNormSet;
        break;
      case 'sinalizacao_horizontal_zebrado':
        fields = SINALIZACAO_HORIZONTAL_ZEBRADO_FIELDS;
        normSet = sinalizacaoHorizontalZebradoNormSet;
        break;
      case 'drenagem_profunda':
      default:
        fields = DRENAGEM_PROFUNDA_FIELDS;
        normSet = profundaNormSet;
        break;
    }
  }

  for (const field of fields) {
    if (trimmed.toLowerCase() === field.toLowerCase()) {
      return true;
    }
  }

  const norm = normalizeColKey(trimmed);
  if (normSet.has(norm)) return true;

  // Universal photo column matching with strict count per feature
  const photoMatch = norm.match(/^(?:foto|imagem|img)_?(\d+)$/);
  if (photoMatch) {
    const photoNum = parseInt(photoMatch[1], 10);
    if (isTurbo) {
      if (
        feature === 'eps_defensa' ||
        feature === 'drenagem_profunda' ||
        feature === 'drenagem_superficial'
      ) {
        return photoNum >= 1 && photoNum <= 4;
      }
      if (feature === 'sinalizacao_vertical') {
        return photoNum >= 1 && photoNum <= 7;
      }
      if (
        feature === 'sinalizacao_horizontal_dispositivo' ||
        feature === 'sinalizacao_horizontal_marca_viaria' ||
        feature === 'sinalizacao_horizontal_zebrado'
      ) {
        return photoNum >= 1 && photoNum <= 5;
      }
      return photoNum >= 1 && photoNum <= 4;
    }

    if (feature === 'eps_defensa') {
      return photoNum >= 1 && photoNum <= 4;
    }
    if (feature === 'sinalizacao_vertical') {
      return photoNum >= 1 && photoNum <= 7;
    }
    if (
      feature === 'sinalizacao_horizontal_dispositivo' ||
      feature === 'sinalizacao_horizontal_marca_viaria' ||
      feature === 'sinalizacao_horizontal_zebrado'
    ) {
      return photoNum >= 1 && photoNum <= 5;
    }
    // drenagem_profunda, drenagem_superficial (standard preset: 1 to 15)
    return photoNum >= 1 && photoNum <= 15;
  }

  if (feature === 'drenagem_profunda') {
    if (
      norm === 'sigla' ||
      norm === 'siglaelemento' ||
      norm === 'sigla_elemento' ||
      norm === 'sigladrenagem'
    ) {
      return true;
    }
    if (
      norm === 'tipomontante' ||
      norm === 'tipo_montante' ||
      norm === 'tipodemontante' ||
      norm === 'montante'
    ) {
      return true;
    }
    if (
      norm === 'tampadanificadainxistente' ||
      norm === 'tampadanificadainexistente' ||
      norm === 'tampadanificada'
    ) {
      return true;
    }
    if (norm === 'sentido') {
      return true;
    }
    if (norm === 'caixadanificada') {
      return true;
    }
    if (norm === 'limpeza' || norm === 'limpeza.') {
      return true;
    }
  } else if (feature === 'drenagem_superficial') {
    if (
      norm === 'extensaoreparar' ||
      norm === 'extensaoreparacao' ||
      norm === 'extensaoparareparar' ||
      norm === 'extensao_reparar'
    ) {
      return true;
    }
    if (
      norm === 'extensaolimpeza' ||
      norm === 'extensaoparalimpeza' ||
      norm === 'extensao_limpeza'
    ) {
      return true;
    }
    if (norm === 'sentido') {
      return true;
    }
    if (
      norm === 'elemento' ||
      norm === 'elementos' ||
      norm === 'tipoelemento' ||
      norm === 'tipo_elemento'
    ) {
      return true;
    }
  } else if (feature === 'sinalizacao_vertical') {
    if (
      norm === 'situacaoretrorrefletancia' ||
      norm === 'situacaoderetrorrefletancia' ||
      norm === 'situacaoretrorefletancia' ||
      norm === 'retrorrefletancia'
    ) {
      return true;
    }
    if (norm === 'materialsuporte' || norm === 'suporte') {
      return true;
    }
    if (norm === 'codigotipo' || norm === 'tipo') {
      return true;
    }
    if (norm === 'metro2' || norm === 'm2' || norm === 'area' || norm === 'aream2') {
      return true;
    }
  } else if (
    feature === 'sinalizacao_horizontal_dispositivo' ||
    feature === 'sinalizacao_horizontal_marca_viaria' ||
    feature === 'sinalizacao_horizontal_zebrado'
  ) {
    if (
      norm === 'resultadogeral' ||
      norm === 'resultado' ||
      norm === 'result' ||
      norm === 'status' ||
      norm === 'situacao' ||
      norm === 'situacaogeral' ||
      norm === 'avaliacao' ||
      norm === 'avaliacaogeral'
    ) {
      return true;
    }
    if (norm === 'tipohorizontal' || norm === 'tipo') {
      return true;
    }
    if (norm === 'localizacao' || norm === 'localizacao') {
      return true;
    }
    if (norm === 'bordo' || norm === 'bord') {
      return true;
    }
    if (norm === 'cor') {
      return true;
    }
  } else if (feature === 'eps_defensa') {
    if (
      norm === 'kmfinal' ||
      norm === 'km_final' ||
      norm === 'kmfim' ||
      norm === 'km_fim' ||
      norm === 'kminicial' ||
      norm === 'km_inicial' ||
      norm === 'kmlegenda' ||
      norm === 'km_legenda'
    ) {
      return true;
    }
    if (
      norm === 'tipodefensa' ||
      norm === 'tipo_defensa' ||
      norm === 'defensa' ||
      norm === 'defensaoae' ||
      norm === 'oae' ||
      norm === 'tipobarreira' ||
      norm === 'tipo_barreira' ||
      norm === 'barreira' ||
      norm === 'barreiradeconcreto' ||
      norm === 'tipodispositivo' ||
      norm === 'tipoelemento' ||
      norm === 'tipo' ||
      norm === 'elemento' ||
      norm === 'dispositivo'
    ) {
      return true;
    }
    if (
      norm === 'sentido' ||
      norm === 'direcao' ||
      norm === 'pista'
    ) {
      return true;
    }
    if (
      norm === 'aparenciageral' ||
      norm === 'aparencia_geral' ||
      norm === 'aparencia'
    ) {
      return true;
    }
    if (
      norm === 'observacao' ||
      norm === 'obs' ||
      norm === 'observacoes' ||
      norm === 'nota' ||
      norm === 'comentario'
    ) {
      return true;
    }
    if (
      norm === 'lado' ||
      norm === 'bordo' ||
      norm === 'posicao' ||
      norm === 'localizacao'
    ) {
      return true;
    }
    if (
      norm === 'extensao' ||
      norm === 'extensaometros' ||
      norm === 'extensao_m' ||
      norm === 'comprimento' ||
      norm === 'extensaototal'
    ) {
      return true;
    }
    if (
      norm === 'rodovia' ||
      norm === 'rodovias' ||
      norm === 'br' ||
      norm === 'trecho'
    ) {
      return true;
    }
    if (
      norm === 'codauto' ||
      norm === 'codigo' ||
      norm === 'cod_auto' ||
      norm === 'id' ||
      norm === 'item'
    ) {
      return true;
    }
  }

  return false;
};

export function matchesEstadoFilterFrontend(itemVal: string, filterVal: string): boolean {
  if (!filterVal || filterVal.toLowerCase() === 'todos') return true;
  const itemNorm = normalizeColKey(itemVal);
  const filterNorm = normalizeColKey(filterVal);

  if (!itemNorm) return false;
  if (itemNorm === filterNorm) return true;
  if (itemNorm.includes(filterNorm) || filterNorm.includes(itemNorm)) return true;

  const isFilterReprovado =
    filterNorm.startsWith('reprovad') ||
    filterNorm === 'nok' ||
    filterNorm === 'ruim' ||
    filterNorm.includes('ruim') ||
    filterNorm.includes('nc') ||
    filterNorm.includes('naoconforme') ||
    filterNorm.includes('pessimo');

  const isFilterAprovado =
    filterNorm.startsWith('aprovad') ||
    filterNorm === 'ok' ||
    filterNorm === 'bom' ||
    filterNorm === 'boa' ||
    filterNorm.startsWith('bom') ||
    filterNorm.startsWith('boa') ||
    filterNorm.includes('conforme');

  const isFilterRegular =
    filterNorm.startsWith('regula') ||
    filterNorm === 'reg' ||
    filterNorm === 'r';

  const isFilterPrecario =
    filterNorm.startsWith('precar') ||
    filterNorm.includes('critico');

  if (isFilterReprovado) {
    return (
      itemNorm.startsWith('reprovad') ||
      itemNorm === 'nok' ||
      itemNorm === 'ruim' ||
      itemNorm.includes('ruim') ||
      itemNorm.includes('nc') ||
      itemNorm.includes('naoconforme') ||
      itemNorm.includes('pessimo')
    );
  }
  if (isFilterRegular) {
    return (
      itemNorm.startsWith('regula') ||
      itemNorm === 'reg' ||
      itemNorm === 'r'
    );
  }
  if (isFilterAprovado) {
    return (
      itemNorm.startsWith('aprovad') ||
      itemNorm === 'ok' ||
      itemNorm === 'bom' ||
      itemNorm === 'boa' ||
      itemNorm.startsWith('bom') ||
      itemNorm.startsWith('boa') ||
      itemNorm.includes('conforme')
    );
  }
  if (isFilterPrecario) {
    return (
      itemNorm.startsWith('precar') ||
      itemNorm.includes('ruim') ||
      itemNorm.includes('pessimo') ||
      itemNorm.startsWith('reprovad') ||
      itemNorm.includes('critico')
    );
  }

  return false;
}

/**
 * Normalizes rodovia names based on the feature type.
 * Specifically for "EPS - Defensa", any variation of BR-376 (e.g. BR/376 CN, BR/376 TU, BR/376 PR, BR-376 CN, etc.)
 * is strictly normalized to "BR/376".
 */
export function normalizeRodoviaForFeature(rodovia: string, featureType?: string): string {
  if (!rodovia) return '';
  const trimmed = rodovia.trim();
  if (featureType === 'eps_defensa') {
    const norm = trimmed
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '');
    if (norm.includes('376')) {
      return 'BR/376';
    }
  }
  return trimmed;
}
