import Patient from "../models/Patient.js";

export const generateUniqueCRNumber = async () => {
  const currentYear = new Date().getFullYear();
  const prefix = `CR-${currentYear}-`;

  try {
    // Find highest existing CR number for current year
    const lastPatient = await Patient.findOne({
      crNo: new RegExp(`^${prefix}`)
    })
      .sort({ crNo: -1 })
      .select("crNo")
      .lean();

    let nextSequence = 1;

    if (lastPatient && lastPatient.crNo) {
      const parts = lastPatient.crNo.split("-");
      if (parts.length === 3) {
        const lastNum = parseInt(parts[2], 10);
        if (!isNaN(lastNum)) {
          nextSequence = lastNum + 1;
        }
      }
    }

    const formattedSequence = String(nextSequence).padStart(5, "0");
    return `${prefix}${formattedSequence}`;
  } catch (error) {
    // Fallback timestamp-based CR if error occurs
    const random = Math.floor(10000 + Math.random() * 90000);
    return `${prefix}${random}`;
  }
};
