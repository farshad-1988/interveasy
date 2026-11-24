import { IsBoolean, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class CompleteTaskDto {
  @IsUUID()
  taskId!: string;
}

export class ProgressQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  taskId?: string;

  @IsOptional()
  @IsUUID()
  moduleId?: string;

  @IsOptional()
  sortBy?: string;
}

export class SetProgressDto {
  @IsOptional()
  @IsBoolean()
  isCompleted?: boolean;
}
