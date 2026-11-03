import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AdminController } from './admin/admin.controller';
import { AdminService } from './admin/admin.service';
import { UsersService } from './admin/users.service';
import { AuditModule } from './audit/audit.service';
import { AuthModule } from './auth/auth.module';
import { CashbackService } from './cashback/cashback.service';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { CsrfGuard } from './common/guards/csrf.guard';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { validateEnv } from './config/env';
import { CustomersController } from './customers/customers.controller';
import { CustomersService } from './customers/customers.service';
import { MeController } from './me/me.controller';
import { MeService } from './me/me.service';
import { NotificationsModule } from './notifications/notifications.module';
import { TelegramModule } from './notifications/telegram.service';
import { PrismaModule } from './prisma/prisma.module';
import { PurchasesController } from './purchases/purchases.controller';
import { PurchasesService } from './purchases/purchases.service';
import { RedemptionsController } from './redemptions/redemptions.controller';
import { RedemptionsService } from './redemptions/redemptions.service';
import { ReportsController, ReportsService } from './reports/reports.controller';
import { TeamController } from './team/team.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ envFilePath: ['../.env', '.env'], isGlobal: true, validate: validateEnv, cache: true }),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 120 }]),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuditModule,
    AuthModule,
    NotificationsModule,
    TelegramModule,
  ],
  controllers: [
    AdminController,
    TeamController,
    CustomersController,
    PurchasesController,
    RedemptionsController,
    MeController,
    ReportsController,
  ],
  providers: [
    AdminService,
    UsersService,
    CashbackService,
    CustomersService,
    PurchasesService,
    RedemptionsService,
    MeService,
    ReportsService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
  ],
})
export class AppModule {}
