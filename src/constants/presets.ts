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

export const SINALIZACAO_HORIZONTAL_DISPOSITIVO_TURBO_FIELDS = [
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
  'Resultado',
] as const;

export const SINALIZACAO_HORIZONTAL_MARCA_VIARIA_TURBO_FIELDS = [
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

export const SINALIZACAO_HORIZONTAL_ZEBRADO_TURBO_FIELDS = [
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

export const TERRAPLENO_FIELDS = [
  'codAuto',
  'situação',
  'Identificação 2S. 2026',
  'lado',
  'km',
  'km Final',
  'rodovia',
  'sentido',
  'Nível Risco 2026 2°Sem',
  'Foto_Anterior',
  'foto1',
  'foto2',
  'foto3',
  'foto4',
  'foto5',
  'foto6',
  'foto7',
  'foto8',
  'foto9',
  'foto10',
  'foto11',
  'foto12',
  'foto13',
  'foto14',
  'foto15',
] as const;

export const TERRAPLENO_TURBO_FIELDS = [
  'codAuto',
  'situação',
  'lado',
  'km',
  'km Final',
  'rodovia',
  'sentido',
  'Nível Risco 2026 2°Sem',
  'Foto_Anterior',
  'foto1',
  'foto2',
  'foto3',
  'foto4',
] as const;

export const RISCO_TERRAPLENO_OPTIONS = [
  { value: '', label: 'Todos os riscos (sem filtro)' },
  { value: 'R4', label: 'R4' },
  { value: 'R3', label: 'R3' },
  { value: 'R2', label: 'R2' },
  { value: 'R1', label: 'R1' },
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
      'Mantém colunas de CodAuto, TipoHorizontal, Localização, Rodovia, Km, Sentido, Bordo, Cor, Resultado Geral e Fotos 1 a 15.',
    fields: SINALIZACAO_HORIZONTAL_DISPOSITIVO_FIELDS,
  },
  sinalizacao_horizontal_marca_viaria: {
    id: 'sinalizacao_horizontal_marca_viaria',
    name: 'Sinalização Horizontal - Marca Viária',
    tagline: 'Linhas, Faixas e Pinturas Viárias',
    description:
      'Mantém colunas de CodAuto, Localização, Rodovia, Km, Sentido, TipoHorizontal, Tipo, Cor, Fotos 1 a 15 e Resultado.',
    fields: SINALIZACAO_HORIZONTAL_MARCA_VIARIA_FIELDS,
  },
  sinalizacao_horizontal_zebrado: {
    id: 'sinalizacao_horizontal_zebrado',
    name: 'Sinalização Horizontal - Zebrado',
    tagline: 'Canalizações, Marcas de Canalização e Zebrados',
    description:
      'Mantém colunas de codAuto, tipoHorizontal, localizacao, rodovia, km, sentido, cor, resultadoGeral e fotos 1 a 15.',
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
  terrapleno: {
    id: 'terrapleno',
    name: 'Terrapleno',
    tagline: 'Taludes, Aterros e Encostas',
    description:
      'Mantém colunas de codAuto, situação, Identificação 2S. 2026, lado, km, km Final, rodovia, sentido, Nível Risco 2026 2°Sem, Foto_Anterior e Fotos 1 a 15.',
    fields: TERRAPLENO_FIELDS,
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

const sinalizacaoHorizontalDispositivoTurboNormSet = new Set(
  SINALIZACAO_HORIZONTAL_DISPOSITIVO_TURBO_FIELDS.map((f) => normalizeColKey(f))
);

const sinalizacaoHorizontalMarcaViariaNormSet = new Set(
  SINALIZACAO_HORIZONTAL_MARCA_VIARIA_FIELDS.map((f) => normalizeColKey(f))
);

const sinalizacaoHorizontalMarcaViariaTurboNormSet = new Set(
  SINALIZACAO_HORIZONTAL_MARCA_VIARIA_TURBO_FIELDS.map((f) => normalizeColKey(f))
);

const sinalizacaoHorizontalZebradoNormSet = new Set(
  SINALIZACAO_HORIZONTAL_ZEBRADO_FIELDS.map((f) => normalizeColKey(f))
);

const sinalizacaoHorizontalZebradoTurboNormSet = new Set(
  SINALIZACAO_HORIZONTAL_ZEBRADO_TURBO_FIELDS.map((f) => normalizeColKey(f))
);

const epsDefensaNormSet = new Set(
  EPS_DEFENSA_FIELDS.map((f) => normalizeColKey(f))
);

const terraplenoNormSet = new Set(
  TERRAPLENO_FIELDS.map((f) => normalizeColKey(f))
);

const terraplenoTurboNormSet = new Set(
  TERRAPLENO_TURBO_FIELDS.map((f) => normalizeColKey(f))
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
      case 'terrapleno':
        fields = TERRAPLENO_TURBO_FIELDS;
        normSet = terraplenoTurboNormSet;
        break;
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
        fields = SINALIZACAO_HORIZONTAL_DISPOSITIVO_TURBO_FIELDS;
        normSet = sinalizacaoHorizontalDispositivoTurboNormSet;
        break;
      case 'sinalizacao_horizontal_marca_viaria':
        fields = SINALIZACAO_HORIZONTAL_MARCA_VIARIA_TURBO_FIELDS;
        normSet = sinalizacaoHorizontalMarcaViariaTurboNormSet;
        break;
      case 'sinalizacao_horizontal_zebrado':
        fields = SINALIZACAO_HORIZONTAL_ZEBRADO_TURBO_FIELDS;
        normSet = sinalizacaoHorizontalZebradoTurboNormSet;
        break;
      case 'drenagem_profunda':
      default:
        fields = DRENAGEM_PROFUNDA_TURBO_FIELDS;
        normSet = profundaTurboNormSet;
        break;
    }
  } else {
    switch (feature) {
      case 'terrapleno':
        fields = TERRAPLENO_FIELDS;
        normSet = terraplenoNormSet;
        break;
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
        feature === 'terrapleno' ||
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
      return photoNum >= 1 && photoNum <= 15;
    }
    // terrapleno, drenagem_profunda, drenagem_superficial (standard preset: 1 to 15)
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
    feature === 'sinalizacao_horizontal_marca_viaria'
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
  } else if (feature === 'sinalizacao_horizontal_zebrado') {
    // Exact requested fields for Zebrado:
    // codAuto, tipoHorizontal, localizacao, rodovia, km, sentido, cor, resultadoGeral, Foto1..Foto15 (Standard) / Foto1..Foto5 (Turbo)
    if (norm === 'codauto') return true;
    if (norm === 'tipohorizontal') return true;
    if (norm === 'localizacao') return true;
    if (norm === 'rodovia') return true;
    if (norm === 'km' || norm === 'kmlegenda' || norm === 'km_legenda') return true;
    if (norm === 'sentido') return true;
    if (norm === 'cor') return true;
    if (norm === 'resultadogeral' || norm === 'resultado_geral') return true;
    return false;
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
  } else if (feature === 'terrapleno') {
    // Explicit exclusions for Turbo mode
    if (isTurbo) {
      if (
        norm === 'status' ||
        norm.includes('ausencia') ||
        norm.includes('problemasemergenciais') ||
        norm.includes('movimentosgravitacionais') ||
        norm.includes('segurancadosusuarios') ||
        norm.includes('classificacaoderiscos')
      ) {
        return false;
      }
    }

    if (
      norm === 'fotoanterior' ||
      norm === 'foto_anterior' ||
      norm === 'imagemanterior' ||
      norm === 'fotoant'
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
    if (norm === 'situacao' || norm === 'situação') {
      return true;
    }
    if (!isTurbo) {
      if (norm === 'status' || norm === 'condicao') {
        return true;
      }
      if (
        norm === 'identificacao2s2026' ||
        norm === 'identificacao2s' ||
        norm === 'identificacao' ||
        norm.startsWith('identificacao')
      ) {
        return true;
      }
    }
    if (norm === 'lado' || norm === 'bordo') {
      return true;
    }
    if (norm === 'km') {
      return true;
    }
    if (
      norm === 'kmfinal' ||
      norm === 'km_final' ||
      norm === 'kmfim' ||
      norm === 'km_fim'
    ) {
      return true;
    }
    if (norm === 'rodovia' || norm === 'rodovias' || norm === 'br') {
      return true;
    }
    if (norm === 'sentido') {
      return true;
    }
    if (
      norm === 'nivelrisco20262sem' ||
      norm === 'nivelrisco2s2026' ||
      norm === 'nivelrisco2sem2026' ||
      norm === 'nivelrisco' ||
      norm === 'nivelderisco' ||
      norm === 'grauderisco' ||
      norm === 'risco'
    ) {
      return true;
    }
    if (!isTurbo && norm.includes('risco')) {
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
  if (itemNorm.length >= 4 && filterNorm.length >= 4 && itemNorm.includes(filterNorm)) return true;

  const isFilterR1 = filterNorm === 'r1' || filterNorm.endsWith('r1');
  const isFilterR2 = filterNorm === 'r2' || filterNorm.endsWith('r2');
  const isFilterR3 = filterNorm === 'r3' || filterNorm.endsWith('r3');
  const isFilterR4 = filterNorm === 'r4' || filterNorm.endsWith('r4');

  if (isFilterR4) {
    if (
      itemNorm === 'r4' ||
      itemNorm.includes('r4') ||
      itemNorm.includes('risco4') ||
      itemNorm.includes('nivel4') ||
      itemNorm.includes('grau4') ||
      itemNorm === '4' ||
      /^4[\s\-_]/.test(itemVal.trim()) ||
      /[\s\-_(]4[)\s\-_]?$/.test(itemVal.trim())
    ) {
      return true;
    }
    return false;
  }
  if (isFilterR3) {
    if (
      itemNorm === 'r3' ||
      itemNorm.includes('r3') ||
      itemNorm.includes('risco3') ||
      itemNorm.includes('nivel3') ||
      itemNorm.includes('grau3') ||
      itemNorm === '3' ||
      /^3[\s\-_]/.test(itemVal.trim()) ||
      /[\s\-_(]3[)\s\-_]?$/.test(itemVal.trim())
    ) {
      return true;
    }
    return false;
  }
  if (isFilterR2) {
    if (
      itemNorm === 'r2' ||
      itemNorm.includes('r2') ||
      itemNorm.includes('risco2') ||
      itemNorm.includes('nivel2') ||
      itemNorm.includes('grau2') ||
      itemNorm === '2' ||
      /^2[\s\-_]/.test(itemVal.trim()) ||
      /[\s\-_(]2[)\s\-_]?$/.test(itemVal.trim())
    ) {
      return true;
    }
    return false;
  }
  if (isFilterR1) {
    if (
      itemNorm === 'r1' ||
      itemNorm.includes('r1') ||
      itemNorm.includes('risco1') ||
      itemNorm.includes('nivel1') ||
      itemNorm.includes('grau1') ||
      itemNorm === '1' ||
      /^1[\s\-_]/.test(itemVal.trim()) ||
      /[\s\-_(]1[)\s\-_]?$/.test(itemVal.trim())
    ) {
      return true;
    }
    return false;
  }

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
      itemNorm === 'reg'
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
      itemNorm === 'prec' ||
      itemNorm.includes('ruim') ||
      itemNorm.includes('pessimo') ||
      itemNorm.startsWith('reprovad') ||
      itemNorm.includes('critico')
    );
  }

  return false;
}

export function extractHighwayPrefixAndNumber(val: string): { prefix: string; number: string; clean: string } {
  if (!val) return { prefix: '', number: '', clean: '' };
  const clean = val.trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  const match = clean.match(/\b([A-Z]{2})[\s\/\-_]?(\d{2,4})\b/);
  if (match) {
    return {
      prefix: match[1].toLowerCase(),
      number: match[2],
      clean: clean.replace(/[^A-Z0-9]/g, '').toLowerCase(),
    };
  }

  const numMatch = clean.match(/\b(\d{2,4})\b/);
  const digits = numMatch ? numMatch[1] : '';
  const cleanOnly = clean.replace(/[^A-Z0-9]/g, '').toLowerCase();

  return { prefix: '', number: digits, clean: cleanOnly };
}

export function matchesRodoviaFilterFrontend(
  cellValue: string,
  filter: string,
  featureType?: string
): boolean {
  if (!filter || filter.toUpperCase() === 'TODAS' || filter.toUpperCase() === 'TODOS') return true;
  if (!cellValue) return false;

  const rawCell = String(cellValue).trim();
  const rawFilter = String(filter).trim();

  if (featureType === 'eps_defensa') {
    const normFilter = normalizeRodoviaForFeature(rawFilter, 'eps_defensa');
    const normCell = normalizeRodoviaForFeature(rawCell, 'eps_defensa');
    if (normFilter === 'BR/376' && normCell === 'BR/376') {
      return true;
    }
  }

  const cellMeta = extractHighwayPrefixAndNumber(rawCell);
  const filterMeta = extractHighwayPrefixAndNumber(rawFilter);

  if (!cellMeta.clean || !filterMeta.clean) return false;

  // Exact clean string match
  if (cellMeta.clean === filterMeta.clean) return true;

  // Disallow match if prefixes conflict (e.g. 'br' vs 'pr')
  if (cellMeta.prefix && filterMeta.prefix && cellMeta.prefix !== filterMeta.prefix) {
    return false;
  }

  // Same number and non-conflicting prefixes
  if (cellMeta.number && filterMeta.number && cellMeta.number === filterMeta.number) {
    if (cellMeta.prefix && filterMeta.prefix && cellMeta.prefix === filterMeta.prefix) {
      return true;
    }
    if (!cellMeta.prefix || !filterMeta.prefix) {
      return true;
    }
  }

  // Substring match only if both clean strings are long enough and no prefix conflict
  if (cellMeta.clean.length >= 4 && filterMeta.clean.length >= 4) {
    if (cellMeta.prefix && filterMeta.prefix && cellMeta.prefix !== filterMeta.prefix) {
      return false;
    }
    if (cellMeta.clean.includes(filterMeta.clean) || filterMeta.clean.includes(cellMeta.clean)) {
      return true;
    }
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
