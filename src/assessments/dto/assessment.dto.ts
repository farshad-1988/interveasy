import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { AssignmentStatus, QuestionType } from '../../generated/prisma/enums';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class CreateAssessmentDto {
  @ApiProperty({ example: 'Full Stack TypeScript Assessment' })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(200)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  title!: string;

  @ApiPropertyOptional({
    example: 'Evaluates proficiency in NestJS, React, and PostgreSQL',
  })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiPropertyOptional({
    example: 'You have 60 minutes. Choose the best answer for each question.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  instructions?: string;

  @ApiPropertyOptional({ example: 60, description: 'Duration in minutes' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(600)
  durationMinutes?: number;

  @ApiPropertyOptional({
    example: 70,
    description: 'Passing threshold percentage (0-100)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  passingScore?: number;
}

export class UpdateAssessmentDto {
  @ApiPropertyOptional({ example: 'Updated Assessment Title' })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  title?: string;

  @ApiPropertyOptional({ example: 'Updated description' })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiPropertyOptional({ example: 'Updated instructions' })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  instructions?: string;

  @ApiPropertyOptional({ example: 45 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(600)
  durationMinutes?: number;

  @ApiPropertyOptional({ example: 75 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  passingScore?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;
}

export class AssessmentQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Filter by published status' })
  @IsOptional()
  @IsString()
  isPublished?: string;

  @ApiPropertyOptional({ description: 'Search title and description' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ default: 'createdAt' })
  @IsOptional()
  @IsString()
  sortBy?: string;
}

export class CreateQuestionDto {
  @ApiProperty({ example: 'What is a Dependency Injection token in NestJS?' })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(1000)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  title!: string;

  @ApiPropertyOptional({ example: 'Additional context or code snippet' })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiProperty({ enum: QuestionType, example: QuestionType.SINGLE_CHOICE })
  @IsEnum(QuestionType)
  type!: QuestionType;

  @ApiPropertyOptional({ default: 1, example: 2 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  points?: number = 1;

  @ApiPropertyOptional({ default: 0, example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  order?: number = 0;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isPublished?: boolean = true;
}

export class UpdateQuestionDto {
  @ApiPropertyOptional({ example: 'Updated question title' })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiPropertyOptional({ enum: QuestionType })
  @IsOptional()
  @IsEnum(QuestionType)
  type?: QuestionType;

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  points?: number;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  order?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;
}

export class CreateOptionDto {
  @ApiProperty({ example: 'A provider identifier used by the IoC container' })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(2000)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  text!: string;

  @ApiProperty({
    example: true,
    description: 'Whether this option is a correct answer',
  })
  @IsBoolean()
  isCorrect!: boolean;

  @ApiPropertyOptional({ default: 0, example: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  order?: number = 0;
}

export class UpdateOptionDto {
  @ApiPropertyOptional({ example: 'Updated option text' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  text?: string;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isCorrect?: boolean;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  order?: number;
}

export class CreateAssignmentDto {
  @ApiProperty({ description: 'UUID of the user to assign this assessment to' })
  @IsNotEmpty()
  @IsUUID()
  userId!: string;

  @ApiPropertyOptional({
    example: '2026-12-01T23:59:59.000Z',
    description: 'Due date',
  })
  @IsOptional()
  @IsDateString()
  dueAt?: string;
}

export class UpdateAssignmentDto {
  @ApiPropertyOptional({ example: '2026-12-15T23:59:59.000Z' })
  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @ApiPropertyOptional({ enum: AssignmentStatus })
  @IsOptional()
  @IsEnum(AssignmentStatus)
  status?: AssignmentStatus;
}

export class SaveAnswerDto {
  @ApiProperty({ description: 'UUID of the AttemptQuestion snapshot' })
  @IsNotEmpty()
  @IsUUID()
  attemptQuestionId!: string;

  @ApiProperty({
    example: ['550e8400-e29b-41d4-a716-446655440000'],
    description: 'UUIDs of selected options',
  })
  @IsArray()
  @IsUUID('4', { each: true })
  selectedOptionIds!: string[];
}
