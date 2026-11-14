import { ForbiddenException, Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ScopeService {
  constructor(private readonly prisma: PrismaService) {}

  async administradoraId(user: AuthUser): Promise<string | null> {
    if (user.role !== Role.ADMINISTRADORA) return null;
    const link = await this.prisma.administradoraUser.findUnique({
      where: { userId: user.id },
      select: { administradoraId: true },
    });
    return link?.administradoraId ?? null;
  }

  /** Condomínios que o usuário pode consultar. ROOT enxerga todos. */
  async condominioIds(user: AuthUser): Promise<string[] | null> {
    if (user.role === Role.ROOT) return null;
    if (user.role === Role.SINDICO) {
      const links = await this.prisma.sindicoVinculo.findMany({
        where: { userId: user.id, endedAt: null },
        select: { condominioId: true },
      });
      return links.map((link) => link.condominioId);
    }
    if (user.role === Role.ADMINISTRADORA) {
      const administradoraId = await this.administradoraId(user);
      if (!administradoraId) return [];
      const condominios = await this.prisma.condominio.findMany({
        where: { administradoraId },
        select: { id: true },
      });
      return condominios.map((condominio) => condominio.id);
    }
    return [];
  }

  async assertCondominioAccess(user: AuthUser, condominioId: string): Promise<void> {
    const allowed = await this.condominioIds(user);
    if (allowed === null) return;
    if (!allowed.includes(condominioId)) {
      throw new ForbiddenException('Você não tem acesso a este condomínio');
    }
  }
}
