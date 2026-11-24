import { Module } from '@nestjs/common';
import { SocialRatingRuntime } from './social-rating.runtime';

@Module({ providers: [SocialRatingRuntime] })
export class SocialRatingModule {}
