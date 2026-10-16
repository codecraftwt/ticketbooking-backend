import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { Venue } from '../models/Venue.js';
import { Hall } from '../models/Hall.js';
import { HallLayout } from '../models/HallLayout.js';

dotenv.config();

const createHallSeats = (rowsCount, seatsPerRow) => {
  const rowLabels = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K', 'L', 'M'];
  const seats = [];

  for (let r = 0; r < rowsCount; r++) {
    const rowLabel = rowLabels[r];
    let tier = 'Standard';
    if (r < 2) tier = 'VIP';
    else if (r < 5) tier = 'Premium';

    // Apply gentle curve to the row
    for (let num = 1; num <= seatsPerRow; num++) {
      // Middle aisle gap
      const aisleOffset = num > seatsPerRow / 2 ? 40 : 0;
      const x = 120 + (num - 1) * 52 + aisleOffset;
      // Slight curvature: edges higher
      const curveY = Math.pow(Math.abs(num - seatsPerRow / 2) / (seatsPerRow / 2), 2) * 15;
      const y = 140 + r * 56 + curveY;

      const isAccessible = r === 0 && (num === 1 || num === 2);
      const isBlocked = r > 2 && (num === 1 || num === seatsPerRow); // Example blocked space

      seats.push({
        id: `${rowLabel}${num}`,
        rowLabel,
        seatNumber: num,
        tier,
        sectionId: r < 2 ? 'vip-section' : 'main-section',
        x: Math.round(x),
        y: Math.round(y),
        isAccessible,
        isBlocked,
        isActive: true,
      });
    }
  }

  return seats;
};

const seed = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('🍃 Connected to MongoDB Atlas.');

    const count = await Venue.countDocuments();
    if (count > 0) {
      console.log(`ℹ️ ${count} venues already exist. Seeding skipped.`);
      process.exit(0);
    }

    // Venue 1: IMAX Grand Cinema
    const venue1 = await Venue.create({
      name: 'Grand IMAX Superplex',
      city: 'Metro City',
      address: '742 Broadway Ave, Cinema District',
      contactPhone: '+1 (555) 234-5678',
      contactEmail: 'contact@grandimax.com',
      amenities: ['Laser IMAX', 'Dolby Atmos 128-ch', 'Recliner Lounges', 'Valet Parking', 'Gourmet Concessions'],
      image: 'https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?w=800&auto=format&fit=crop&q=80',
    });

    const hall1 = await Hall.create({
      venueId: venue1._id,
      name: 'Screen 1 (Laser IMAX)',
      screenType: 'IMAX',
      capacity: 96,
      totalRows: 8,
    });

    const seats1 = createHallSeats(8, 12);
    const layout1 = await HallLayout.create({
      hallId: hall1._id,
      version: 1,
      isPublished: true,
      canvasWidth: 950,
      canvasHeight: 680,
      stage: {
        label: 'CURVED 70MM IMAX LASER SCREEN',
        position: 'top',
        width: 650,
        yOffset: 35,
      },
      sections: [
        { id: 'vip-section', name: 'VIP Recliner Row', color: '#f59e0b', defaultTier: 'VIP', basePriceMultiplier: 1.5 },
        { id: 'main-section', name: 'Main Auditorium', color: '#6366f1', defaultTier: 'Standard', basePriceMultiplier: 1.0 },
      ],
      seats: seats1,
      totalSeats: seats1.filter((s) => s.isActive && !s.isBlocked).length,
      accessibleSeatsCount: seats1.filter((s) => s.isAccessible).length,
    });

    hall1.activeLayoutId = layout1._id;
    hall1.capacity = layout1.totalSeats;
    await hall1.save();

    // Hall 2 under Venue 1
    const hall2 = await Hall.create({
      venueId: venue1._id,
      name: 'Screen 2 (Dolby Cinema Atmos)',
      screenType: 'Dolby Cinema',
      capacity: 64,
      totalRows: 6,
    });
    const seats2 = createHallSeats(6, 10);
    const layout2 = await HallLayout.create({
      hallId: hall2._id,
      version: 1,
      isPublished: true,
      canvasWidth: 900,
      canvasHeight: 580,
      stage: {
        label: 'DOLBY VISION 4K HDR SCREEN',
        position: 'top',
        width: 550,
        yOffset: 35,
      },
      sections: [
        { id: 'main-section', name: 'Dolby Theatre', color: '#8b5cf6', defaultTier: 'Premium', basePriceMultiplier: 1.25 },
      ],
      seats: seats2,
      totalSeats: seats2.filter((s) => s.isActive && !s.isBlocked).length,
      accessibleSeatsCount: seats2.filter((s) => s.isAccessible).length,
    });
    hall2.activeLayoutId = layout2._id;
    hall2.capacity = layout2.totalSeats;
    await hall2.save();

    // Venue 2: Olympic Arena
    const venue2 = await Venue.create({
      name: 'National Olympic Amphitheatre',
      city: 'Metro City',
      address: '100 Stadium Way, North District',
      contactPhone: '+1 (555) 987-6543',
      contactEmail: 'events@olympicarena.org',
      amenities: ['15,000 Capacity', 'Skyboxes', 'Full Broadcast Production', 'Dedicated Accessibility Zones'],
      image: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=800&auto=format&fit=crop&q=80',
    });

    const arenaHall = await Hall.create({
      venueId: venue2._id,
      name: 'Grand Concert Arena',
      screenType: 'Theatre Stage',
      capacity: 120,
      totalRows: 10,
    });
    const arenaSeats = createHallSeats(10, 12);
    const arenaLayout = await HallLayout.create({
      hallId: arenaHall._id,
      version: 1,
      isPublished: true,
      canvasWidth: 1000,
      canvasHeight: 750,
      stage: {
        label: 'MAIN CONCERT STAGE & CATWALK',
        position: 'top',
        width: 700,
        yOffset: 35,
      },
      sections: [
        { id: 'vip-section', name: 'Pit / VIP Front Row', color: '#ec4899', defaultTier: 'VIP', basePriceMultiplier: 2.0 },
        { id: 'main-section', name: 'Arena Stalls', color: '#3b82f6', defaultTier: 'Standard', basePriceMultiplier: 1.0 },
      ],
      seats: arenaSeats,
      totalSeats: arenaSeats.filter((s) => s.isActive && !s.isBlocked).length,
      accessibleSeatsCount: arenaSeats.filter((s) => s.isAccessible).length,
    });
    arenaHall.activeLayoutId = arenaLayout._id;
    arenaHall.capacity = arenaLayout.totalSeats;
    await arenaHall.save();

    console.log('✅ Seeded 2 Venues, 3 Halls, and 3 rich Visual Layout snapshots successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding venues:', error);
    process.exit(1);
  }
};

seed();
