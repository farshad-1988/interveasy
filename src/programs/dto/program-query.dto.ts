import { IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class ProgramQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  sortBy?: string;

  @IsOptional()
  @IsString()
  @IsIn(['true', 'false'])
  isActive?: string;
}
