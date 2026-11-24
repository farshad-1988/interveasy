import { plainToInstance, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
  validateSync,
} from 'class-validator';

import { parseDurationToMs } from '../auth/utils/duration.util';

export class EnvironmentVariables {
  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  @IsString()
  @MinLength(32, {
    message: 'JWT_SECRET must be at least 32 characters',
  })
  JWT_SECRET!: string;

  @IsString()
  @IsNotEmpty()
  JWT_ACCESS_EXPIRES_IN!: string;

  @IsString()
  @IsNotEmpty()
  JWT_REFRESH_EXPIRES_IN!: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  COOKIE_SECURE?: boolean;

  @IsOptional()
  @IsIn(['lax', 'strict', 'none'])
  COOKIE_SAMESITE?: 'lax' | 'strict' | 'none';

  @IsOptional()
  @IsString()
  CORS_ORIGIN?: string;

  @IsOptional()
  @IsString()
  NODE_ENV?: string;
}

export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
    whitelist: true,
    forbidNonWhitelisted: false,
  });

  if (errors.length > 0) {
    const messages = errors
      .map((error) => Object.values(error.constraints ?? {}).join(', '))
      .join('; ');
    throw new Error(`Invalid environment variables: ${messages}`);
  }

  const accessMs = parseDurationToMs(validatedConfig.JWT_ACCESS_EXPIRES_IN);
  const refreshMs = parseDurationToMs(validatedConfig.JWT_REFRESH_EXPIRES_IN);

  if (accessMs > 60 * 60 * 1000) {
    throw new Error('JWT_ACCESS_EXPIRES_IN must be 1 hour or less');
  }

  if (refreshMs > 30 * 24 * 60 * 60 * 1000) {
    throw new Error('JWT_REFRESH_EXPIRES_IN must be 30 days or less');
  }

  if (refreshMs <= accessMs) {
    throw new Error(
      'JWT_REFRESH_EXPIRES_IN must be greater than JWT_ACCESS_EXPIRES_IN',
    );
  }

  if (
    validatedConfig.COOKIE_SAMESITE === 'none' &&
    validatedConfig.COOKIE_SECURE !== true
  ) {
    throw new Error('COOKIE_SAMESITE=none requires COOKIE_SECURE=true');
  }

  return {
    ...config,
    ...validatedConfig,
  };
}
