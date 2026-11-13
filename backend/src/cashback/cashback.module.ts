import { Module } from '@nestjs/common';
import { CashbackService } from './cashback.service';

@Module({
  providers: [CashbackService],
  exports: [CashbackService],
})
export class CashbackModule {}
