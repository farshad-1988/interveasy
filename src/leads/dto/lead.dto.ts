import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsIn,
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
import { LeadSource, LeadStatus } from '../../generated/prisma/enums';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class CreateDemoRequestDto {
  @ApiProperty({
    description: 'Full name of the contact person',
    minLength: 2,
    maxLength: 100,
    example: 'Alice Walker',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(100)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  fullName!: string;

  @ApiProperty({
    description: 'Business email address',
    example: 'alice@company.com',
  })
  @IsEmail()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  email!: string;

  @ApiPropertyOptional({
    description: 'Contact phone number',
    maxLength: 20,
    example: '+1-555-0199',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  phone?: string;

  @ApiPropertyOptional({
    description: 'Company or organization name',
    maxLength: 100,
    example: 'Acme Technologies',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  company?: string;

  @ApiPropertyOptional({
    description: 'Job title of the contact',
    maxLength: 100,
    example: 'VP of Engineering',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  jobTitle?: string;

  @ApiPropertyOptional({
    description: 'Size of the engineering / hiring team',
    minimum: 1,
    maximum: 100000,
    example: 25,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  teamSize?: number;

  @ApiPropertyOptional({
    description: 'Optional message describing demo requirements',
    maxLength: 2000,
    example:
      'Interested in technical mock interview assessment workflows for 30 developers.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  message?: string;

  @ApiPropertyOptional({
    enum: LeadSource,
    default: LeadSource.WEBSITE,
    description: 'Lead acquisition channel',
  })
  @IsOptional()
  @IsEnum(LeadSource)
  source?: LeadSource = LeadSource.WEBSITE;
}

export class CreateLeadDto extends CreateDemoRequestDto {
  @ApiPropertyOptional({
    enum: LeadStatus,
    default: LeadStatus.NEW,
    description: 'Initial status of the lead',
  })
  @IsOptional()
  @IsEnum(LeadStatus)
  status?: LeadStatus = LeadStatus.NEW;

  @ApiPropertyOptional({
    description: 'Administrative or qualification notes',
    maxLength: 5000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  adminNotes?: string;

  @ApiPropertyOptional({
    description: 'UUID of user assigned to this lead',
  })
  @IsOptional()
  @IsUUID()
  assignedToId?: string;
}

export class UpdateLeadDto {
  @ApiPropertyOptional({ example: 'Alice Walker' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  fullName?: string;

  @ApiPropertyOptional({ example: 'alice@company.com' })
  @IsOptional()
  @IsEmail()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  email?: string;

  @ApiPropertyOptional({ example: '+1-555-0199' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  phone?: string;

  @ApiPropertyOptional({ example: 'Acme Technologies' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  company?: string;

  @ApiPropertyOptional({ example: 'VP of Engineering' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  jobTitle?: string;

  @ApiPropertyOptional({ example: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  teamSize?: number;

  @ApiPropertyOptional({ example: 'Interested in technical assessments.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  message?: string;

  @ApiPropertyOptional({ enum: LeadSource })
  @IsOptional()
  @IsEnum(LeadSource)
  source?: LeadSource;

  @ApiPropertyOptional({ enum: LeadStatus })
  @IsOptional()
  @IsEnum(LeadStatus)
  status?: LeadStatus;

  @ApiPropertyOptional({ example: 'Updated admin notes' })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  adminNotes?: string;

  @ApiPropertyOptional({ example: '550e8400-e29b-41d4-a716-446655440000' })
  @IsOptional()
  @IsUUID()
  assignedToId?: string | null;
}

export class AdminLeadsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: LeadStatus,
    description: 'Filter leads by current lifecycle status',
  })
  @IsOptional()
  @IsEnum(LeadStatus)
  status?: LeadStatus;

  @ApiPropertyOptional({
    enum: LeadSource,
    description: 'Filter leads by acquisition source',
  })
  @IsOptional()
  @IsEnum(LeadSource)
  source?: LeadSource;

  @ApiPropertyOptional({
    description: 'Filter by email substring',
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  email?: string;

  @ApiPropertyOptional({
    description: 'Filter by company name substring',
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  company?: string;

  @ApiPropertyOptional({
    description:
      'Filter leads with team size greater than or equal to this value',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  teamSizeMin?: number;

  @ApiPropertyOptional({
    description: 'Filter leads with team size less than or equal to this value',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  teamSizeMax?: number;

  @ApiPropertyOptional({
    description: 'Filter leads created on or after this ISO date',
  })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({
    description: 'Filter leads created on or before this ISO date',
  })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({
    description: 'Sort field: createdAt, status, email, company, teamSize',
    enum: ['createdAt', 'status', 'email', 'company', 'teamSize'],
    default: 'createdAt',
  })
  @IsOptional()
  @IsString()
  @IsIn(['createdAt', 'status', 'email', 'company', 'teamSize'])
  sortBy?: 'createdAt' | 'status' | 'email' | 'company' | 'teamSize' =
    'createdAt';
}

export class UpdateLeadStatusDto {
  @ApiProperty({
    enum: LeadStatus,
    description: 'New target lifecycle status',
    example: LeadStatus.CONTACTED,
  })
  @IsEnum(LeadStatus)
  status!: LeadStatus;

  @ApiPropertyOptional({
    description: 'Internal administrative notes regarding the lead transition',
    maxLength: 5000,
    example: 'Spoke with Alice; scheduled demo for next Tuesday at 2 PM UTC.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  adminNotes?: string;
}

export class AssignLeadDto {
  @ApiPropertyOptional({
    description:
      'UUID of the user (admin/sales) to assign this lead to, or null to unassign',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsOptional()
  @IsUUID()
  assignedToId?: string | null;
}
