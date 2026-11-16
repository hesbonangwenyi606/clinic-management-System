import { BadRequestException } from '@nestjs/common';
import { VisitStatus } from '@prisma/client';

export interface ReportFilters {
  from?: string;
  to?: string;
  status?: string;
  department?: string;
  method?: string;
}

export function parseReportFilters(input: ReportFilters) {
  function date(value: string | undefined, label: string) {
    if (value === undefined) return undefined;
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new BadRequestException(`${label} must use YYYY-MM-DD.`);
    const parsed = new Date(`${value}T00:00:00Z`);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new BadRequestException(`${label} is not a valid date.`);
    return new Date(`${value}T00:00:00+03:00`);
  }
  const from = date(input.from, 'From date');
  const to = date(input.to, 'To date');
  if (from && to && from > to) throw new BadRequestException('From date must be on or before the to date.');
  function choice(value: string | undefined, values: string[], label: string) {
    if (value !== undefined && !values.includes(value)) throw new BadRequestException(`Unknown ${label}.`);
    return value;
  }
  const status = choice(input.status, Object.values(VisitStatus), 'visit status') as VisitStatus | undefined;
  const department = choice(input.department, ['TRIAGE','CLINICAL','RECOVERY','CATERING'], 'care department');
  const method = choice(input.method, ['CASH','MPESA_RECORDED','BANK_RECORDED'], 'payment method');
  const dateRange = from || to ? { ...(from ? { gte: from } : {}), ...(to ? { lt: new Date(to.getTime() + 86_400_000) } : {}) } : undefined;
  return { dateRange, status, department, method, filters: { from: input.from ?? null, to: input.to ?? null, status: status ?? null, department: department ?? null, method: method ?? null, timezone: 'Africa/Nairobi' } };
}
