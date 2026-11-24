import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { InterviewStatus, NoteVisibility } from '../../generated/prisma/enums';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class CreateInterviewDto {
  @ApiProperty({ description: 'UUID of the interviewer' })
  @IsUUID()
  interviewerId!: string;

  @ApiPropertyOptional({
    description: 'Optional assessment UUID linked to this interview',
  })
  @IsOptional()
  @IsUUID()
  assessmentId?: string;

  @ApiProperty({ example: 'Senior Backend System Design' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  title!: string;

  @ApiPropertyOptional({
    example: 'Discuss architecture and database optimization',
  })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @ApiProperty({ example: '2026-11-20T14:00:00.000Z' })
  @IsDateString()
  startAt!: string;

  @ApiProperty({ example: '2026-11-20T15:00:00.000Z' })
  @IsDateString()
  endAt!: string;

  @ApiProperty({ example: 'UTC' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  timezone!: string;

  @ApiPropertyOptional({ example: 'https://meet.google.com/xyz-abc-def' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  meetingUrl?: string;
}

export class UpdateInterviewDto {
  @ApiPropertyOptional({ example: 'Senior Backend System Design - Updated' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  title?: string;

  @ApiPropertyOptional({ example: 'Updated notes and meeting focus' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @ApiPropertyOptional({ example: 'https://meet.google.com/new-meeting-url' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  meetingUrl?: string;

  @ApiPropertyOptional({ example: '2026-11-20T14:30:00.000Z' })
  @IsOptional()
  @IsDateString()
  startAt?: string;

  @ApiPropertyOptional({ example: '2026-11-20T15:30:00.000Z' })
  @IsOptional()
  @IsDateString()
  endAt?: string;

  @ApiPropertyOptional({ example: 'America/New_York' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  timezone?: string;

  @ApiPropertyOptional({ description: 'Optional assessment UUID' })
  @IsOptional()
  @IsUUID()
  assessmentId?: string | null;
}

export class UpdateInterviewStatusDto {
  @ApiProperty({ enum: InterviewStatus, example: InterviewStatus.CONFIRMED })
  @IsEnum(InterviewStatus)
  status!: InterviewStatus;

  @ApiPropertyOptional({ example: 'Confirmed with candidate' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

export class InterviewQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: InterviewStatus })
  @IsOptional()
  @IsEnum(InterviewStatus)
  status?: InterviewStatus;

  @ApiPropertyOptional({ enum: ['candidate', 'interviewer'] })
  @IsOptional()
  @IsIn(['candidate', 'interviewer'])
  role?: 'candidate' | 'interviewer';

  @ApiPropertyOptional({ example: '2026-11-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-11-30T23:59:59.999Z' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ default: 'startAt' })
  @IsOptional()
  @IsString()
  sortBy?: string;
}

export class AdminInterviewQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: InterviewStatus })
  @IsOptional()
  @IsEnum(InterviewStatus)
  status?: InterviewStatus;

  @ApiPropertyOptional({ description: 'Filter by candidate user ID' })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({ description: 'Filter by interviewer user ID' })
  @IsOptional()
  @IsUUID()
  interviewerId?: string;

  @ApiPropertyOptional({ example: '2026-11-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-11-30T23:59:59.999Z' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ description: 'Search title and description' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ default: 'startAt' })
  @IsOptional()
  @IsString()
  sortBy?: string;
}

export class CreateInterviewNoteDto {
  @ApiProperty({
    example: 'Candidate demonstrated strong depth in Postgres partitioning.',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(5000)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  content!: string;

  @ApiProperty({ enum: NoteVisibility, default: NoteVisibility.SHARED })
  @IsEnum(NoteVisibility)
  visibility!: NoteVisibility;
}

export class UpdateInterviewNoteDto {
  @ApiPropertyOptional({ example: 'Updated observation content' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  content?: string;

  @ApiPropertyOptional({ enum: NoteVisibility })
  @IsOptional()
  @IsEnum(NoteVisibility)
  visibility?: NoteVisibility;
}

export class CreateAvailabilityDto {
  @ApiProperty({
    description: '0 for Sunday, 1 for Monday, etc.',
    minimum: 0,
    maximum: 6,
  })
  @IsInt()
  @Min(0)
  @Max(6)
  @Type(() => Number)
  dayOfWeek!: number;

  @ApiProperty({ example: '09:00', description: 'HH:mm 24-hour format' })
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
  startTime!: string;

  @ApiProperty({ example: '17:00', description: 'HH:mm 24-hour format' })
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
  endTime!: string;

  @ApiProperty({ example: 'America/New_York' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  timezone!: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateAvailabilityDto {
  @ApiPropertyOptional({ minimum: 0, maximum: 6 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  @Type(() => Number)
  dayOfWeek?: number;

  @ApiPropertyOptional({ example: '10:00' })
  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
  startTime?: string;

  @ApiPropertyOptional({ example: '18:00' })
  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
  endTime?: string;

  @ApiPropertyOptional({ example: 'America/New_York' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  timezone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class AvailabilitySlotsQueryDto {
  @ApiProperty({ example: '2026-11-20T00:00:00.000Z' })
  @IsDateString()
  from!: string;

  @ApiProperty({ example: '2026-11-27T23:59:59.999Z' })
  @IsDateString()
  to!: string;

  @ApiPropertyOptional({ default: 30, minimum: 5, maximum: 480 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(480)
  slotMinutes?: number;

  @ApiPropertyOptional({ example: 'UTC' })
  @IsOptional()
  @IsString()
  timezone?: string;
}
