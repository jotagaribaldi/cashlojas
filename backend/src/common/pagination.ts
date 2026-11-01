import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Sanitize } from './utils/sanitize';

export class PaginationQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;

  @IsOptional()
  @Sanitize()
  @IsString()
  @MaxLength(80)
  search?: string;
}

export class DateRangeQuery extends PaginationQuery {
  @IsOptional()
  @IsDateString({ strict: true })
  from?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  to?: string;
}
