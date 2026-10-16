import { Hall } from '../models/Hall.js';
import { HallLayout } from '../models/HallLayout.js';
import { Venue } from '../models/Venue.js';

// Default layout generator helper
const createInitialLayout = (hallId) => {
  const rows = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  const seatsPerRow = 12;
  const seats = [];

  rows.forEach((rowLabel, rowIndex) => {
    let tier = 'Standard';
    if (rowIndex < 2) tier = 'VIP';
    else if (rowIndex < 5) tier = 'Premium';

    for (let num = 1; num <= seatsPerRow; num++) {
      // Calculate realistic x and y on canvas
      const x = 140 + num * 55;
      const y = 140 + rowIndex * 60;
      const isAccessible = rowIndex === 0 && (num === 1 || num === seatsPerRow);

      seats.push({
        id: `${rowLabel}${num}`,
        rowLabel,
        seatNumber: num,
        tier,
        sectionId: 'main',
        x,
        y,
        isAccessible,
        isBlocked: false,
        isActive: true,
      });
    }
  });

  return {
    hallId,
    version: 1,
    isPublished: true,
    canvasWidth: 950,
    canvasHeight: 680,
    stage: {
      label: 'IMAX CURVED SCREEN / STAGE',
      position: 'top',
      width: 600,
      yOffset: 40,
    },
    sections: [
      { id: 'main', name: 'Main Auditorium', color: '#6366f1', defaultTier: 'Standard', totalPriceMultiplier: 1.0 },
    ],
    seats,
    totalSeats: seats.length,
    accessibleSeatsCount: seats.filter((s) => s.isAccessible).length,
  };
};

// POST /api/admin/halls - Create hall and default layout
export const createHall = async (req, res) => {
  try {
    const { venueId, name, screenType } = req.body;
    if (!venueId || !name) {
      return res.status(400).json({ success: false, message: 'Venue ID and hall name are required.' });
    }

    const venue = await Venue.findById(venueId);
    if (!venue) {
      return res.status(404).json({ success: false, message: 'Venue not found.' });
    }

    const hall = new Hall({
      venueId,
      name,
      screenType: screenType || 'Standard',
      capacity: 96,
      totalRows: 8,
    });
    await hall.save();

    // Generate initial layout snapshot
    const initialLayoutData = createInitialLayout(hall._id);
    const layout = await HallLayout.create(initialLayoutData);

    hall.activeLayoutId = layout._id;
    await hall.save();

    res.status(201).json({
      success: true,
      message: 'Hall and initial visual layout created successfully.',
      data: {
        ...hall.toObject(),
        activeLayout: layout,
      },
    });
  } catch (error) {
    console.error('Error creating hall:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/admin/halls/:id - Get hall by id with active layout
export const getHallById = async (req, res) => {
  try {
    const hall = await Hall.findById(req.params.id).populate('venueId');
    if (!hall) {
      return res.status(404).json({ success: false, message: 'Hall not found.' });
    }

    let layout = null;
    if (hall.activeLayoutId) {
      layout = await HallLayout.findById(hall.activeLayoutId);
    } else {
      // Find latest layout draft if not set
      layout = await HallLayout.findOne({ hallId: hall._id }).sort({ version: -1 });
    }

    res.json({
      success: true,
      data: {
        ...hall.toObject(),
        layout,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// PUT /api/admin/halls/:id - Update hall details
export const updateHall = async (req, res) => {
  try {
    const hall = await Hall.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!hall) {
      return res.status(404).json({ success: false, message: 'Hall not found.' });
    }
    res.json({ success: true, message: 'Hall updated successfully.', data: hall });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// DELETE /api/admin/halls/:id
export const deleteHall = async (req, res) => {
  try {
    const hall = await Hall.findById(req.params.id);
    if (!hall) {
      return res.status(404).json({ success: false, message: 'Hall not found.' });
    }

    await HallLayout.deleteMany({ hallId: hall._id });
    await hall.deleteOne();

    res.json({ success: true, message: 'Hall and all layouts deleted successfully.' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// POST /api/admin/halls/:id/layout - Save draft or publish updated layout
export const saveHallLayout = async (req, res) => {
  try {
    const hallId = req.params.id;
    const { seats, sections, stage, canvasWidth, canvasHeight, isPublish } = req.body;

    const hall = await Hall.findById(hallId);
    if (!hall) {
      return res.status(404).json({ success: false, message: 'Hall not found.' });
    }

    const activeSeats = seats.filter((s) => s.isActive && !s.isBlocked);
    const accessibleCount = seats.filter((s) => s.isAccessible).length;
    const uniqueRows = [...new Set(seats.map((s) => s.rowLabel))].length;

    let layout;
    if (isPublish) {
      // Find current latest version
      const latest = await HallLayout.findOne({ hallId }).sort({ version: -1 });
      const nextVersion = latest ? latest.version + 1 : 1;

      layout = await HallLayout.create({
        hallId,
        version: nextVersion,
        isPublished: true,
        canvasWidth: canvasWidth || 950,
        canvasHeight: canvasHeight || 680,
        stage: stage || { label: 'SCREEN / STAGE', position: 'top', width: 600, yOffset: 40 },
        sections: sections || [],
        seats: seats || [],
        totalSeats: activeSeats.length,
        accessibleSeatsCount: accessibleCount,
      });

      // Point hall to this newly published version
      hall.activeLayoutId = layout._id;
      hall.capacity = activeSeats.length;
      hall.totalRows = uniqueRows;
      await hall.save();
    } else {
      // Update existing draft or create if none exists
      layout = await HallLayout.findOneAndUpdate(
        { hallId, isPublished: false },
        {
          canvasWidth,
          canvasHeight,
          stage,
          sections,
          seats,
          totalSeats: activeSeats.length,
          accessibleSeatsCount: accessibleCount,
        },
        { new: true, upsert: true }
      );
    }

    res.json({
      success: true,
      message: isPublish ? 'Hall layout published as active snapshot!' : 'Layout draft saved.',
      data: layout,
    });
  } catch (error) {
    console.error('Error saving hall layout:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
