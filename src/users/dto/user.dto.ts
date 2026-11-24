import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Role } from '../../generated/prisma/enums';

export class CreateUserDto {
  @ApiProperty({
    example: 'user@example.com',
    description: 'User email address',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @ApiProperty({
    example: 'Password123!',
    description: 'User password (min 8 characters)',
  })
  @IsString()
  @MinLength(8)
  @MaxLength(100)
  password!: string;

  @ApiPropertyOptional({
    example: 'Jane Doe',
    description: 'Full name of the user',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({
    enum: Role,
    default: Role.USER,
    description: 'Role assigned to the user',
  })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;
}

export class UpdateUserDto {
  @ApiPropertyOptional({
    example: 'Jane Doe',
    description: 'Updated full name',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({
    example: 'jane.new@example.com',
    description: 'Updated email address',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @ApiPropertyOptional({
    enum: Role,
    description: 'Updated user role (Admin only)',
  })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;
}

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Jane Doe' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ example: 'jane@example.com' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(255)
  email?: string;
}

export class UpdateUserRoleDto {
  @ApiProperty({ enum: Role, example: Role.ADMIN })
  @IsNotEmpty()
  @IsEnum(Role)
  role!: Role;
}
