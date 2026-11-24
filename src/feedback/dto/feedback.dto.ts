import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { FeedbackCategory } from '../../generated/prisma/enums';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class CreateFeedbackDto {
  @ApiProperty({
    description:
      'UUID of the user being evaluated (must be a participant in the interview)',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  subjectId!: string;

  @ApiProperty({
    enum: FeedbackCategory,
    description: 'Category of evaluation',
    example: FeedbackCategory.TECHNICAL,
  })
  @IsEnum(FeedbackCategory)
  category!: FeedbackCategory;

  @ApiProperty({
    description: 'Score from 1 (lowest) to 5 (highest)',
    minimum: 1,
    maximum: 5,
    example: 4,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  score!: number;

  @ApiPropertyOptional({
    description: 'Detailed written feedback commentary',
    maxLength: 5000,
    example:
      'Strong problem-solving abilities and clear architectural reasoning.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  comment?: string;
}

export class UpdateFeedbackDto {
  @ApiPropertyOptional({
    description: 'Score from 1 (lowest) to 5 (highest)',
    minimum: 1,
    maximum: 5,
    example: 5,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  score?: number;

  @ApiPropertyOptional({
    description: 'Updated feedback commentary',
    maxLength: 5000,
    example: 'Revised comments after debrief.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  comment?: string;
}

export class FeedbackQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: FeedbackCategory,
    description: 'Filter feedback by category',
  })
  @IsOptional()
  @IsEnum(FeedbackCategory)
  category?: FeedbackCategory;

  @ApiPropertyOptional({
    description: 'Filter feedback received by a specific subject UUID',
  })
  @IsOptional()
  @IsUUID()
  subjectId?: string;

  @ApiPropertyOptional({
    description: 'Filter feedback submitted on or after this ISO date',
    example: '2026-01-01T00:00:00Z',
  })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({
    description: 'Filter feedback submitted on or before this ISO date',
    example: '2026-12-31T23:59:59Z',
  })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({
    description: 'Sort field: createdAt, score, or category',
    enum: ['createdAt', 'score', 'category'],
    default: 'createdAt',
  })
  @IsOptional()
  @IsString()
  @IsIn(['createdAt', 'score', 'category'])
  sortBy?: 'createdAt' | 'score' | 'category' = 'createdAt';
}

export class AdminFeedbackQueryDto extends FeedbackQueryDto {
  @ApiPropertyOptional({
    description: 'Filter feedback submitted by author UUID',
  })
  @IsOptional()
  @IsUUID()
  authorId?: string;

  @ApiPropertyOptional({
    description: 'Filter feedback linked to interview UUID',
  })
  @IsOptional()
  @IsUUID()
  interviewId?: string;
}

export class FeedbackAnalyticsQueryDto {
  @ApiPropertyOptional({
    description: 'Start of date range (ISO date)',
    example: '2026-01-01T00:00:00Z',
  })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({
    description: 'End of date range (ISO date)',
    example: '2026-12-31T23:59:59Z',
  })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({
    enum: FeedbackCategory,
    description: 'Filter analytics to a specific category',
  })
  @IsOptional()
  @IsEnum(FeedbackCategory)
  category?: FeedbackCategory;

  @ApiPropertyOptional({
    description: 'Filter analytics for a specific subject user UUID',
  })
  @IsOptional()
  @IsUUID()
  subjectId?: string;
}
