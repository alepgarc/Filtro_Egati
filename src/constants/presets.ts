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
  'repararEntorno',
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
  'ObservacaoPlacaDanificada',
] as const;

export const DRAINAGE_FEATURES: Record<DrainageFeatureType, DrainageFeatureConfig> = {
  drenagem_profunda: {
    id: 'drenagem_profunda',
    name: 'Drenagem Profunda',
    tagline: 'Subterrânea / Caixas, Poços e Tampas',
    description:
      'Mantém colunas de caixas, tampas, reparo de entorno, limpeza, estado de conservação e fotos.',
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
      'Mantém colunas de posição, localização, tipo, suporte, dimensões, fotos, situação de retrorrefletância e observação de placa danificada.',
    fields: SINALIZACAO_VERTICAL_FIELDS,
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

const superficialNormSet = new Set(
  DRENAGEM_SUPERFICIAL_FIELDS.map((f) => normalizeColKey(f))
);

const sinalizacaoVerticalNormSet = new Set(
  SINALIZACAO_VERTICAL_FIELDS.map((f) => normalizeColKey(f))
);

export const isDefaultPresetField = (
  columnName: string,
  feature: DrainageFeatureType = 'drenagem_profunda'
): boolean => {
  if (!columnName) return false;
  const trimmed = columnName.trim();
  const fields =
    feature === 'sinalizacao_vertical'
      ? SINALIZACAO_VERTICAL_FIELDS
      : feature === 'drenagem_superficial'
      ? DRENAGEM_SUPERFICIAL_FIELDS
      : DRENAGEM_PROFUNDA_FIELDS;

  const normSet =
    feature === 'sinalizacao_vertical'
      ? sinalizacaoVerticalNormSet
      : feature === 'drenagem_superficial'
      ? superficialNormSet
      : profundaNormSet;

  for (const field of fields) {
    if (trimmed.toLowerCase() === field.toLowerCase()) {
      return true;
    }
  }

  const norm = normalizeColKey(trimmed);
  if (normSet.has(norm)) return true;

  if (feature === 'drenagem_profunda') {
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
    if (norm === 'repararentorno') {
      return true;
    }
    if (norm === 'caixadanificada') {
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
    if (norm === 'elemento') {
      return true;
    }
  } else if (feature === 'sinalizacao_vertical') {
    if (
      norm === 'situacaoretrorrefletancia' ||
      norm === 'situacaoretrorrefletancia' ||
      norm === 'situacaoretrorefletancia' ||
      norm === 'retrorrefletancia'
    ) {
      return true;
    }
    if (
      norm === 'observacaoplacadanificada' ||
      norm === 'observacaoplacasdanificadas' ||
      norm === 'placadanificada'
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
  }

  return false;
};
