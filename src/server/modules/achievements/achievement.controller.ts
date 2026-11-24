import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
  Header,
  Res,
  NotFoundException,
  Query,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { AchievementService, collection } from './achievement.service';
import { PrismaService } from '../../database/prisma.service';
import { Public } from '../../common/decorators/public.decorator';
import { TmaInitDataGuard, type TmaUser } from '../../common/guards/tma-init-data.guard';

import { BotsService } from '../../bots/bots.service';
import { Api } from 'grammy';
import { profileRanks } from './profile-ranks';
import { iconFile } from './achievement-icons';
import { socialScore } from '../social-rating/social-score';
import type { Response } from 'express';
@Controller('achievement-icons')
export class IconController {
  @Public() @Get(':key') read(@Param('key') key: string, @Res() res: Response) {
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    return res.sendFile(iconFile(key));
  }
}
@Controller('bots/:bot/chat-achievements/:chat')
export class AchievementController {
  constructor(private readonly service: AchievementService) {}
  @Get() list(@Param('bot') b: string, @Param('chat') c: string) {
    return this.service.list(b, c);
  }
  @Post() create(
    @Param('bot') b: string,
    @Param('chat') c: string,
    @Body() body: Parameters<AchievementService['save']>[3],
  ) {
    return this.service.save(b, c, null, body);
  }
  @Put(':id') edit(
    @Param('bot') b: string,
    @Param('chat') c: string,
    @Param('id') id: string,
    @Body() body: Parameters<AchievementService['save']>[3],
  ) {
    return this.service.save(b, c, id, body);
  }
  @Delete(':id') remove(
    @Param('bot') b: string,
    @Param('chat') c: string,
    @Param('id') id: string,
  ) {
    return this.service.remove(b, c, id);
  }
}
@Controller('tma')
export class AchievementCollectionController {
  constructor(
    private readonly db: PrismaService,
    private readonly bots: BotsService,
  ) {}

  private async profileChat(slug: string) {
    const app = await this.db.miniApp.findFirst({
      where: { slug, templateType: 'profile', isActive: 1 },
    });
    const chat = JSON.parse(app?.configJson ?? '{}').chatId;
    if (!app || typeof chat !== 'string') throw new NotFoundException();
    return { botId: app.botId, chat };
  }

  @Public()
  @UseGuards(TmaInitDataGuard)
  @Header('Cache-Control', 'private, no-store')
  @Get(':slug/tops')
  async tops(
    @Param('slug') slug: string,
    @Req() req: { tmaUser: TmaUser },
    @Query('mode') mode = 'rating',
    @Query('days') days = '30',
  ) {
    if (!['rating', 'awards'].includes(mode) || !['7', '30', '365'].includes(days))
      throw new BadRequestException();
    const { botId, chat } = await this.profileChat(slug);
    const bot = await this.db.bot.findUniqueOrThrow({
      where: { id: botId },
      select: { token: true },
    });
    const member = await new Api(bot.token, { timeoutSeconds: 8 }).getChatMember(
      chat,
      req.tmaUser.id,
    );
    if (
      member.status === 'left' ||
      member.status === 'kicked' ||
      (member.status === 'restricted' && !member.is_member)
    )
      throw new ForbiddenException('Топы доступны участникам чата');
    return profileRanks(this.db, botId, chat, String(req.tmaUser.id), mode, Number(days));
  }

  @Public()
  @UseGuards(TmaInitDataGuard)
  @Header('Cache-Control', 'private, max-age=900')
  @Get(':slug/chat-avatar')
  async avatar(@Param('slug') slug: string, @Res() res: Response) {
    const { botId, chat } = await this.profileChat(slug);
    const connection = await this.db.chatConnection.findUnique({
      where: { botId_chatId: { botId, chatId: chat } },
    });
    const bytes = connection && (await this.bots.avatar(botId, connection.id));
    if (!bytes) throw new NotFoundException();
    res.type('jpeg').send(bytes);
  }
  @Public()
  @UseGuards(TmaInitDataGuard)
  @Header('Cache-Control', 'private, no-store')
  @Get(':slug/summary')
  async summary(@Param('slug') slug: string, @Req() req: { tmaUser: TmaUser }) {
    const { botId, chat } = await this.profileChat(slug);
    const connection = await this.db.chatConnection.findUnique({
      where: { botId_chatId: { botId, chatId: chat } },
      select: { title: true },
    });
    return {
      name: req.tmaUser.first_name ?? req.tmaUser.username ?? 'Участник',
      chatTitle: connection?.title,
      score: await socialScore(this.db, botId, chat, String(req.tmaUser.id)),
    };
  }
  @Public()
  @UseGuards(TmaInitDataGuard)
  @Header('Cache-Control', 'private, no-store')
  @Get(':slug/achievements')
  async mine(@Param('slug') slug: string, @Req() req: { tmaUser: TmaUser }) {
    const app = await this.db.miniApp.findFirst({
      where: { slug, templateType: { in: ['achievements', 'profile'] }, isActive: 1 },
    });
    if (!app) throw new NotFoundException();
    const chat = JSON.parse(app.configJson ?? '{}').chatId;
    if (typeof chat !== 'string') throw new NotFoundException();
    return collection(this.db, app.botId, chat, String(req.tmaUser.id), true);
  }
}
