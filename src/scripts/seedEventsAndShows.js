import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { Event } from '../models/Event.js';
import { Show } from '../models/Show.js';
import { Venue } from '../models/Venue.js';
import { Hall } from '../models/Hall.js';
import { HallLayout } from '../models/HallLayout.js';
import { ShowSeat } from '../models/ShowSeat.js';

dotenv.config();

const seed = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('🍃 Connected to MongoDB Atlas.');

    const venues = await Venue.find();
    if (venues.length === 0) {
      console.log('❌ Please run seedVenues.js first.');
      process.exit(1);
    }

    const halls = await Hall.find();
    const imaxHall = halls.find((h) => h.screenType === 'IMAX') || halls[0];
    const dolbyHall = halls.find((h) => h.screenType === 'Dolby Cinema') || halls[1] || halls[0];
    const stageHall = halls.find((h) => h.screenType === 'Theatre Stage') || halls[2] || halls[0];

    const imaxLayout = await HallLayout.findById(imaxHall.activeLayoutId);
    const dolbyLayout = await HallLayout.findById(dolbyHall.activeLayoutId);
    const stageLayout = await HallLayout.findById(stageHall.activeLayoutId);

    const eventCount = await Event.countDocuments();
    if (eventCount > 0) {
      console.log(`ℹ️ ${eventCount} events already exist in database.`);
      process.exit(0);
    }

    // 1. Interstellar: 10th Anniversary IMAX
    const event1 = await Event.create({
      title: 'Interstellar: 10th Anniversary IMAX',
      slug: 'interstellar-10th-anniversary-imax',
      category: 'Movie',
      genre: 'Sci-Fi / Adventure / Drama',
      description: "Experience Christopher Nolan's Oscar-winning masterpiece on the giant 70mm IMAX laser screen with remastered 12-channel uncompressed sound.",
      posterImage: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=800&auto=format&fit=crop&q=80',
      bannerImage: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1600&auto=format&fit=crop&q=80',
      durationMinutes: 169,
      ageRating: 'PG-13',
      cancellationPolicy: 'Full refund up to 2 hours before scheduled showtime.',
      status: 'Published',
      publishedAt: new Date(),
    });

    // 2. Coldplay: Music of the Spheres Tour
    const event2 = await Event.create({
      title: 'Coldplay: Music of the Spheres Tour',
      slug: 'coldplay-music-of-the-spheres-tour',
      category: 'Concert',
      genre: 'Pop / Alternative Rock',
      description: 'The spectacular global stadium tour featuring synchronized LED wristbands, laser fireworks, and anthems including Yellow, Viva La Vida, and Fix You.',
      posterImage: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=800&auto=format&fit=crop&q=80',
      bannerImage: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=1600&auto=format&fit=crop&q=80',
      durationMinutes: 150,
      ageRating: 'G',
      cancellationPolicy: 'Non-refundable within 24 hours of event start.',
      status: 'Published',
      publishedAt: new Date(),
    });

    // 3. Midnight Comedy Club: Special Showcase
    const event3 = await Event.create({
      title: 'Midnight Comedy Club: Special Showcase',
      slug: 'midnight-comedy-club-showcase',
      category: 'Comedy',
      genre: 'Standup Comedy / Live',
      description: 'An intimate evening featuring five nationally touring headline comedians delivering fresh, unfiltered standup sets. Includes 1 complimentary craft cocktail.',
      posterImage: 'https://images.unsplash.com/photo-1585699324551-f6c309eedeca?w=800&auto=format&fit=crop&q=80',
      bannerImage: 'https://images.unsplash.com/photo-1516280440614-37939bbacd81?w=1600&auto=format&fit=crop&q=80',
      durationMinutes: 105,
      ageRating: 'A',
      cancellationPolicy: 'Refunds accepted up to 4 hours prior.',
      status: 'Published',
      publishedAt: new Date(),
    });

    // 4. Dune: Part Two - Extended Experience
    const event4 = await Event.create({
      title: 'Dune: Part Two - Extended IMAX Experience',
      slug: 'dune-part-two-extended-imax',
      category: 'Movie',
      genre: 'Sci-Fi / Epic Saga',
      description: 'Paul Atreides unites with Chani and the Fremen while seeking revenge against the conspirators who destroyed his family.',
      posterImage: 'https://images.unsplash.com/photo-1478760329108-5c3ed9d495a0?w=800&auto=format&fit=crop&q=80',
      bannerImage: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=1600&auto=format&fit=crop&q=80',
      durationMinutes: 166,
      ageRating: 'PG-13',
      cancellationPolicy: 'Free cancellation up to 4 hours prior.',
      status: 'Published',
      publishedAt: new Date(),
    });

    // Helper to schedule a show and populate ShowSeats
    const createShowWithSeats = async (event, venue, hall, layout, startTime, endTime, pricing) => {
      const show = new Show({
        eventId: event._id,
        venueId: venue._id,
        hallId: hall._id,
        layoutSnapshotId: layout._id,
        startTime,
        endTime,
        pricing,
        totalSeats: layout.totalSeats,
        bookedSeatsCount: 0,
        status: 'Open',
      });
      await show.save();

      const priceMap = {};
      pricing.forEach((p) => {
        priceMap[p.tier] = p.price;
      });

      const showSeats = layout.seats.map((s) => ({
        showId: show._id,
        seatId: s.id,
        rowLabel: s.rowLabel,
        seatNumber: s.seatNumber,
        tier: s.tier,
        price: priceMap[s.tier] || 25,
        x: s.x,
        y: s.y,
        isAccessible: s.isAccessible,
        isBlocked: s.isBlocked,
        status: s.isBlocked ? 'BLOCKED' : 'AVAILABLE',
      }));

      await ShowSeat.insertMany(showSeats);
      return show;
    };

    // Schedule Shows
    const now = new Date();

    // Show 1: Interstellar tonight at 19:30
    const start1 = new Date(now);
    start1.setDate(start1.getDate() + 1);
    start1.setHours(19, 30, 0, 0);
    const end1 = new Date(start1);
    end1.setMinutes(end1.getMinutes() + 170);

    await createShowWithSeats(
      event1,
      imaxHall.venueId,
      imaxHall,
      imaxLayout,
      start1,
      end1,
      [
        { tier: 'VIP', price: 40 },
        { tier: 'Premium', price: 28 },
        { tier: 'Standard', price: 20 },
      ]
    );

    // Show 2: Interstellar late screening at 23:00
    const start2 = new Date(now);
    start2.setDate(start2.getDate() + 1);
    start2.setHours(23, 0, 0, 0);
    const end2 = new Date(start2);
    end2.setMinutes(end2.getMinutes() + 170);

    await createShowWithSeats(
      event1,
      imaxHall.venueId,
      imaxHall,
      imaxLayout,
      start2,
      end2,
      [
        { tier: 'VIP', price: 35 },
        { tier: 'Premium', price: 25 },
        { tier: 'Standard', price: 18 },
      ]
    );

    // Show 3: Coldplay Concert at Arena in 3 days
    const start3 = new Date(now);
    start3.setDate(start3.getDate() + 3);
    start3.setHours(20, 0, 0, 0);
    const end3 = new Date(start3);
    end3.setMinutes(end3.getMinutes() + 150);

    await createShowWithSeats(
      event2,
      stageHall.venueId,
      stageHall,
      stageLayout,
      start3,
      end3,
      [
        { tier: 'VIP', price: 150 },
        { tier: 'Premium', price: 95 },
        { tier: 'Standard', price: 55 },
      ]
    );

    // Show 4: Midnight Comedy Showcase in 2 days
    const start4 = new Date(now);
    start4.setDate(start4.getDate() + 2);
    start4.setHours(21, 30, 0, 0);
    const end4 = new Date(start4);
    end4.setMinutes(end4.getMinutes() + 110);

    await createShowWithSeats(
      event3,
      dolbyHall.venueId,
      dolbyHall,
      dolbyLayout,
      start4,
      end4,
      [
        { tier: 'VIP', price: 60 },
        { tier: 'Premium', price: 45 },
        { tier: 'Standard', price: 30 },
      ]
    );

    console.log('✅ Seeded 4 Published Events and 4 Scheduled Shows with atomic ShowSeats in MongoDB Atlas!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding events and shows:', error);
    process.exit(1);
  }
};

seed();
