import { BadRequestException } from '@nestjs/common';

export interface ListQuery {
  page?: string;
  pageSize?: string;
  search?: string;
  visitId?: string;
  department?: string;
  status?: string;
}

export function pagination(input: ListQuery, defaultSize = 50) {
  const number = (value: string | undefined, fallback: number) => {
    if (value === undefined) return fallback;
    if (typeof value !== 'string' || !/^\d+$/.test(value)) throw new BadRequestException('Invalid pagination.');
    const result = Number(value);
    if (!Number.isSafeInteger(result) || result < 1 || result > 1_000_000) throw new BadRequestException('Invalid pagination.');
    return result;
  };
  if (input.search !== undefined && (typeof input.search !== 'string' || input.search.length > 200)) throw new BadRequestException('Search must contain at most 200 characters.');
  const page = number(input.page, 1);
  const take = Math.min(number(input.pageSize, defaultSize), 100);
  return { skip: (page - 1) * take, take, page, search: input.search?.trim() || undefined };
}
