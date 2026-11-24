import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsUUID } from 'class-validator';
import { EnrollmentStatus } from '../../generated/prisma/enums';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class CreateEnrollmentDto {
  @ApiProperty({ description: 'UUID of the program to enroll in' })
  @IsNotEmpty()
  @IsUUID()
  programId!: string;
}

export class UpdateEnrollmentStatusDto {
  @ApiProperty({
    enum: EnrollmentStatus,
    example: EnrollmentStatus.COMPLETED,
    description: 'Updated enrollment status (ACTIVE, COMPLETED, CANCELLED)',
  })
  @IsNotEmpty()
  @IsEnum(EnrollmentStatus)
  status!: EnrollmentStatus;
}

export class EnrollmentQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Filter by program UUID' })
  @IsOptional()
  @IsUUID()
  programId?: string;

  @ApiPropertyOptional({
    enum: EnrollmentStatus,
    description: 'Filter by enrollment status',
  })
  @IsOptional()
  @IsEnum(EnrollmentStatus)
  status?: EnrollmentStatus;

  @ApiPropertyOptional({ description: 'Filter by user UUID (Admin only)' })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({ default: 'enrolledAt' })
  @IsOptional()
  sortBy?: string;
}
