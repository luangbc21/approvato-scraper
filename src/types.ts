export interface FilterParams {
  area?: string;
  banca?: string;
  orgao?: string;
  ano?: number;
  disciplina?: string;
  page?: number;
  uf?: string;
}

export interface Question {
  id: string;
  statement: string;
  alternatives: {
    A?: string;
    B?: string;
    C?: string;
    D?: string;
    E?: string;
  };
  discipline: {
    id: number;
    name: string;
  };
  subjects: Array<{
    id: number;
    name: string;
  }>;
  examining_board: {
    id: number;
    name: string;
    acronym: string;
  };
  institute: {
    id: number;
    name: string;
    acronym: string;
  };
  exams: Array<{
    id: number;
    name: string;
  }>;
  administrative_level: {
    id: number;
    name: string;
  };
  nullified: boolean;
  outdated: boolean;
  associated_text: any;
  year: string;
}

export interface ScrapeResult {
  questions: Question[];
  meta: {
    total_count: number;
    total_pages: number;
    current_page: number;
    per_page: number;
  };
}
