import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { apiReference } from '@scalar/nestjs-api-reference';
import { AppModule } from './app.module';
import { config } from 'dotenv';
import { join } from 'path';
import cookieParser from 'cookie-parser';

config({ path: join(__dirname, '../../../.env') });

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // enable cookie parser
  app.use(cookieParser());

  // Global API prefix
  app.setGlobalPrefix('api/v2');

  // CORS configuration
  app.enableCors({
    origin: [process.env.CORS_ORIGIN, 'http://localhost:5173'],
    credentials: process.env.CORS_CREDENTIALS === 'true',
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Strip properties that don't have decorators
      forbidNonWhitelisted: true, // Throw error if non-whitelisted properties are present
      transform: true, // Automatically transform payloads to DTO instances
      transformOptions: {
        enableImplicitConversion: true, // Allow implicit type conversion
      },
    }),
  );

  // OpenAPI (Swagger) configuration
  const config = new DocumentBuilder()
    .setTitle('DigiLearn Customer Relations Management System API')
    .setDescription(
      'A comprehensive Customer Relations Management system API with authentication, authorization, and role-based access control. ' +
        'Features include user management, RBAC with CASL permissions, JWT authentication, refresh tokens, 2FA, and session management.',
    )
    .setVersion('2.0.0')
    .setContact(
      'DigiLearn Support',
      'https://clearhue.online',
      'support@clearhue.online',
    )
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Enter JWT access token',
        in: 'header',
      },
      'JWT-auth', // This name will be used in @ApiBearerAuth()
    )
    .addTag(
      'Authentication',
      'User authentication, registration, and session management',
    )
    .addTag('Password Management', 'Password reset and change operations')
    .addTag('Two-Factor Authentication', '2FA setup and management')
    .addTag(
      'RBAC',
      'Role-Based Access Control - permissions and roles management',
    )
    .addTag('Settings', 'Application settings and configuration management')
    .addTag(
      'Users Management',
      'User and admin user management with CRUD operations',
    )
    .addTag('Pipelines', 'Pipeline management for sales workflows')
    .addTag('Pipeline Stages', 'Stage management within pipelines')
    .addTag('Activity Logs', 'System activity and audit logging')
    .build();

  const document = SwaggerModule.createDocument(app, config);

  // Mount Scalar API documentation
  app.use(
    '/api/v2/docs',
    apiReference({
      spec: {
        content: document,
      },
      theme: 'purple',
      darkMode: true,
      layout: 'modern',
      showSidebar: true,
      searchHotKey: 'k',
    } as any),
  );

  const port = process.env.SMS_PORT ?? 3000;
  await app.listen(port, '0.0.0.0');

  console.log(`\n🚀 Application is running on: http://localhost:${port}`);
  console.log(`📚 API Documentation: http://localhost:${port}/api/v2/docs\n`);
}

bootstrap();
