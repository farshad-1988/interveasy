import { DEFAULT_LIMIT, DEFAULT_PAGE } from '../dto/pagination-query.dto';

export type PaginationMeta = {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
};

export type PaginatedResponse<T> = {
  data: T[];
  meta: PaginationMeta;
};

export function buildPaginationMeta(
  total: number,
  page: number = DEFAULT_PAGE,
  limit: number = DEFAULT_LIMIT,
): PaginationMeta {
  const p = page || DEFAULT_PAGE;
  const l = limit || DEFAULT_LIMIT;
  const totalPages = total === 0 ? 0 : Math.ceil(total / l);

  return {
    total,
    page: p,
    limit: l,
    totalPages,
    hasNextPage: totalPages > 0 && p < totalPages,
    hasPreviousPage: totalPages > 0 && p > 1,
  };
}

export function getSkipTake(
  page: number = DEFAULT_PAGE,
  limit: number = DEFAULT_LIMIT,
) {
  const p = page || DEFAULT_PAGE;
  const l = limit || DEFAULT_LIMIT;

  return {
    skip: (p - 1) * l,
    take: l,
  };
}
