import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { Env } from '../config/env';
import { AuthController } from './auth.controller';
import { ActivationService } from './activation.service';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';

@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        secret: config.get('JWT_ACCESS_SECRET', { infer: true }),
        signOptions: {
          expiresIn: config.get('JWT_ACCESS_TTL_SECONDS', { infer: true }),
          issuer: config.get('JWT_ISSUER', { infer: true }),
          algorithm: 'HS256',
        },
        verifyOptions: {
          issuer: config.get('JWT_ISSUER', { infer: true }),
          algorithms: ['HS256'],
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, TokenService, ActivationService],
  exports: [AuthService, TokenService, ActivationService],
})
export class AuthModule {}
