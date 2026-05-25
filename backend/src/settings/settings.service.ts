
import { Injectable, BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

type MobileAppVersionStatus = 'ACTIVE' | 'DEPRECATED' | 'BLOCKED';

type MobileAppVersionEntry = {
  platform: string;
  versionName: string;
  buildNumber: number;
  status: MobileAppVersionStatus;
  message?: string;
  storeUrl?: string;
};

type MobileAppConfig = {
  enabled?: boolean;
  allowIfNoVersion?: boolean;
  requireVersionHeaders?: boolean;
  defaultMessage?: string;
  defaultStoreUrl?: string;
  versions?: MobileAppVersionEntry[];
};

@Injectable()
export class SettingsService {
  constructor(private prisma: PrismaService) {}

  private _mobileConfigCache: { loadedAtMs: number; value: MobileAppConfig } | null =
    null;
  private readonly _mobileConfigCacheTtlMs = 30_000;

  async getSettings() {
    let settings = await this.prisma.systemSettings.findUnique({
      where: { id: 'SYSTEM_SETTINGS' },
    });

    if (!settings) {
      settings = await this.prisma.systemSettings.create({
        data: {
          id: 'SYSTEM_SETTINGS',
        },
      });
    }

    return settings;
  }

  private _coerceMobileConfig(raw: any): MobileAppConfig {
    const cfg = (raw && typeof raw === 'object') ? raw : {};
    const versionsRaw = Array.isArray((cfg as any).versions) ? (cfg as any).versions : [];
    const versions: MobileAppVersionEntry[] = versionsRaw
      .map((v: any) => ({
        platform: (v?.platform ?? '').toString().trim().toLowerCase(),
        versionName: (v?.versionName ?? '').toString().trim(),
        buildNumber: Number(v?.buildNumber ?? NaN),
        status: (v?.status ?? 'ACTIVE').toString().trim().toUpperCase(),
        message: v?.message != null ? v.message.toString() : undefined,
        storeUrl: v?.storeUrl != null ? v.storeUrl.toString() : undefined,
      }))
      .filter((v) => v.platform && v.versionName && Number.isFinite(v.buildNumber));

    return {
      enabled: Boolean((cfg as any).enabled ?? false),
      allowIfNoVersion: Boolean((cfg as any).allowIfNoVersion ?? true),
      requireVersionHeaders: Boolean((cfg as any).requireVersionHeaders ?? false),
      defaultMessage:
        (cfg as any).defaultMessage?.toString() ||
        'Update required. Please update the SMARTVAHAN app to continue.',
      defaultStoreUrl: (cfg as any).defaultStoreUrl?.toString() || '',
      versions: versions.map((v) => ({
        ...v,
        status:
          v.status === 'DEPRECATED' || v.status === 'BLOCKED' || v.status === 'ACTIVE'
            ? (v.status as MobileAppVersionStatus)
            : 'ACTIVE',
      })),
    };
  }

  async getMobileAppConfig(): Promise<MobileAppConfig> {
    const now = Date.now();
    if (
      this._mobileConfigCache &&
      now - this._mobileConfigCache.loadedAtMs < this._mobileConfigCacheTtlMs
    ) {
      return this._mobileConfigCache.value;
    }

    const settings = await this.getSettings();
    const raw = (settings as any).mobileAppConfig;
    const cfg = this._coerceMobileConfig(raw);
    this._mobileConfigCache = { loadedAtMs: now, value: cfg };
    return cfg;
  }

  private _isLikelyMobileClient(headers: Record<string, any>): boolean {
    const h = (k: string) => (headers[k] ?? headers[k.toLowerCase()]) as any;
    const hasAppHeaders =
      h('x-app-platform') != null || h('x-app-version') != null || h('x-app-build') != null;
    if (hasAppHeaders) return true;
    const ua = (h('user-agent') ?? '').toString();
    return ua.includes('Dart/') || ua.includes('okhttp') || ua.includes('Flutter');
  }

  async enforceMobileAppVersion(
    headers: Record<string, any>,
    action: 'LOGIN' | 'CERTIFICATE',
  ) {
    const cfg = await this.getMobileAppConfig();
    if (!cfg.enabled) return;

    const likelyMobile = this._isLikelyMobileClient(headers);
    if (!likelyMobile) return;

    const upgradeRequiredStatus = ((HttpStatus as any).UPGRADE_REQUIRED ?? 426) as number;

    const get = (k: string) => (headers[k] ?? headers[k.toLowerCase()]) as any;
    const platform = (get('x-app-platform') ?? '').toString().trim().toLowerCase();
    const versionName = (get('x-app-version') ?? '').toString().trim();
    const buildNumberStr = (get('x-app-build') ?? '').toString().trim();
    const buildNumber = buildNumberStr ? Number(buildNumberStr) : NaN;

    const hasAnyVersionInfo = Boolean(platform || versionName || buildNumberStr);
    if (!hasAnyVersionInfo) {
      if (cfg.allowIfNoVersion) return;
      throw new HttpException(
        {
          code: 'APP_UPDATE_REQUIRED',
          message: cfg.defaultMessage,
          storeUrl: cfg.defaultStoreUrl || null,
          action,
        },
        upgradeRequiredStatus,
      );
    }

    if (cfg.requireVersionHeaders && (!platform || !Number.isFinite(buildNumber))) {
      throw new HttpException(
        {
          code: 'APP_UPDATE_REQUIRED',
          message: cfg.defaultMessage,
          storeUrl: cfg.defaultStoreUrl || null,
          action,
        },
        upgradeRequiredStatus,
      );
    }

    const versions = Array.isArray(cfg.versions) ? cfg.versions : [];
    if (!versions.length) {
      return;
    }

    const match = versions.find((v) => {
      if (platform && v.platform !== platform) return false;
      if (Number.isFinite(buildNumber) && v.buildNumber === buildNumber) return true;
      if (versionName && v.versionName === versionName) return true;
      return false;
    });

    if (!match || match.status !== 'ACTIVE') {
      const msg = (match?.message ?? cfg.defaultMessage) || cfg.defaultMessage;
      const url = (match?.storeUrl ?? cfg.defaultStoreUrl) || cfg.defaultStoreUrl || null;
      throw new HttpException(
        {
          code: 'APP_UPDATE_REQUIRED',
          message: msg,
          storeUrl: url,
          action,
        },
        upgradeRequiredStatus,
      );
    }
  }

  async updateSettings(data: any) {
    this._mobileConfigCache = null;
    return this.prisma.systemSettings.upsert({
      where: { id: 'SYSTEM_SETTINGS' },
      update: data,
      create: {
        id: 'SYSTEM_SETTINGS',
        ...data,
      },
    });
  }

  async getHomePagePublic() {
    let homePageContent: any = null;
    try {
      const settings = await this.getSettings();
      homePageContent = (settings as any).homePageContent || null;
    } catch {
      homePageContent = null;
    }

    let states: Array<{ code: string; name: string }> = [];
    let oems: Array<{ code: string; name: string; logo: string | null }> = [];
    let registrationOems: Array<{ code: string; name: string; authorizedStates: string[] }> = [];
    let totalQrCodeIssued = 0;
    let totalCertificateGenerated = 0;
    let totalVehicleFitments = 0;
    let totalStatesServed = 0;
    let totalRtosServed = 0;

    try {
      [states, oems, registrationOems] = await Promise.all([
        this.prisma.state.findMany({
          where: { showOnHomepage: true } as any,
          select: { code: true, name: true }
        }),
        this.prisma.oEM.findMany({
          where: { showOnHomepage: true } as any,
          select: { code: true, name: true, logo: true }
        }),
        this.prisma.oEM.findMany({
          select: { code: true, name: true, authorizedStates: true }
        })
      ]);

      const [qrCount, certCount, uniqueVehicleNumbers, stateCount, rtoCount] = await Promise.all([
        this.prisma.qRCode.count({ where: { batch: { isGhost: false } } }),
        this.prisma.certificate.count({ where: { NOT: { count: 0 } } }),
        this.prisma.certificate.groupBy({
          by: ['vehicleNumber'],
          where: { NOT: { count: 0 } },
          _count: { _all: true }
        }),
        this.prisma.state.count(),
        this.prisma.rTO.count()
      ]);

      totalQrCodeIssued = qrCount;
      totalCertificateGenerated = certCount;
      totalVehicleFitments = uniqueVehicleNumbers.length;
      totalStatesServed = stateCount;
      totalRtosServed = rtoCount;
    } catch {
    }

    return {
      success: true,
      data: {
        content: homePageContent,
        states,
        oems,
        registrationOems,
        stats: {
          totalQrCodeIssued,
          totalCertificateGenerated,
          totalVehicleFitments,
          totalStatesServed,
          totalRtosServed
        }
      }
    };
  }

  async submitContact(data: { name?: string; email?: string; phone?: string; message?: string }) {
    const name = (data.name || '').trim();
    const email = (data.email || '').trim();
    const phone = (data.phone || '').trim();
    const message = (data.message || '').trim();

    if (!name) throw new BadRequestException('Name is required');
    if (!message) throw new BadRequestException('Message is required');
    if (!email && !phone) throw new BadRequestException('Email or phone is required');

    const created = await (this.prisma as any).contactSubmission.create({
      data: {
        name,
        email: email || null,
        phone: phone || null,
        message
      }
    });

    return { success: true, data: { id: created.id } };
  }
}
