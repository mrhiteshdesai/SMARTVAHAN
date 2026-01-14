import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { Dealer, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class DealersService {
  constructor(private prisma: PrismaService) {}

  async create(data: any): Promise<Dealer> {
    const hashedPassword = await bcrypt.hash(data.password, 10);
    
    // Handle OEMs
    const oemConnect = [];
    if (data.oemCodes && Array.isArray(data.oemCodes)) {
        data.oemCodes.forEach((code: string) => oemConnect.push({ code }));
    } else if (data.oemCode) {
        oemConnect.push({ code: data.oemCode });
    }
    if (data.oemIds && Array.isArray(data.oemIds)) {
        data.oemIds.forEach((id: string) => oemConnect.push({ id }));
    }

    // Handle RTO
    const rtoData = (data.rtoCode === 'ALL' || !data.rtoCode)
        ? { allRTOs: true, rtoCode: null }
        : { allRTOs: false, rtoCode: data.rtoCode };

    // Remove fields we handled specially or that need mapping
    const { oemCode, oemCodes, oemIds, rtoCode, address, pincode, ...rest } = data;

    console.log('Creating Dealer with data:', {
        ...rest,
        ...rtoData,
        locationAddress: address || data.locationAddress,
        zip: pincode || data.zip,
        oemsConnect: oemConnect
    });

    try {
        return await this.prisma.dealer.create({
            data: {
                ...rest,
                ...rtoData,
                locationAddress: address || data.locationAddress,
                zip: pincode || data.zip,
                password: hashedPassword,
                radius: data.radius ? parseFloat(data.radius) : 10,
                latitude: data.latitude ? parseFloat(data.latitude) : null,
                longitude: data.longitude ? parseFloat(data.longitude) : null,
                oems: {
                    connect: oemConnect
                }
            },
        });
    } catch (e) {
        console.error('Error creating dealer:', e);
        throw e;
    }
  }

  async findAll(): Promise<Dealer[]> {
    return this.prisma.dealer.findMany({
        include: {
            state: true,
            rto: true,
            oems: true
        },
        orderBy: { createdAt: 'desc' }
    });
  }

  async findOne(id: string): Promise<Dealer | null> {
    return this.prisma.dealer.findUnique({
        where: { id },
        include: {
            state: true,
            rto: true,
            oems: true
        }
    });
  }

  async update(id: string, data: any): Promise<Dealer> {
    if (data.password) {
        data.password = await bcrypt.hash(data.password, 10);
    }
    if (data.radius) data.radius = parseFloat(data.radius);
    if (data.latitude) data.latitude = parseFloat(data.latitude);
    if (data.longitude) data.longitude = parseFloat(data.longitude);

    const updateData: any = { ...data };
    
    // Handle OEMs update if provided
    if (data.oemCodes) {
        updateData.oems = {
            set: data.oemCodes.map((code: string) => ({ code }))
        };
        delete updateData.oemCodes;
    } else if (data.oemCode) { // fallback
         updateData.oems = {
            set: [{ code: data.oemCode }]
        };
        delete updateData.oemCode;
    }

    // Handle RTO update if provided
    if (data.rtoCode !== undefined) {
        if (data.rtoCode === 'ALL' || !data.rtoCode) {
            updateData.allRTOs = true;
            updateData.rtoCode = null;
        } else {
            updateData.allRTOs = false;
            updateData.rtoCode = data.rtoCode;
        }
    }

    return this.prisma.dealer.update({
      where: { id },
      data: updateData,
    });
  }

  async remove(id: string): Promise<Dealer> {
    return this.prisma.dealer.delete({ where: { id } });
  }
}
