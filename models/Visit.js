import mongoose from "mongoose";

const medicationSchema = new mongoose.Schema(
  {
    medicine: String,
    dosage: String,
    frequency: String,
    duration: String,
    instructions: String,
  },
  { _id: false }
);

const followUpSchema = new mongoose.Schema(
  {
    date: { type: String },
    instructions: { type: String },
    notes: { type: String },
    status: { type: String, enum: ["Upcoming", "Completed", "Cancelled"], default: "Upcoming" },
  },
  { _id: false }
);

const histopathologySchema = new mongoose.Schema(
  {
    reportDetails: { type: String },
    reportDate: { type: String },
    resultFindings: { type: String },
    comments: { type: String },
  },
  { _id: false }
);

const visitSchema = new mongoose.Schema(
  {
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Patient",
      required: [true, "Patient ID is required"],
      index: true,
    },
    visitNumber: {
      type: Number,
      default: 1,
    },
    visitType: {
      type: String,
      enum: ["OPD", "IPD", "IPD / Admission", "Follow-up", "Emergency", "Procedure", "Other"],
      default: "OPD",
      index: true,
    },
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    doctorName: {
      type: String,
      trim: true,
    },
    departmentId: {
      type: String,
    },
    departmentName: {
      type: String,
      trim: true,
    },
    ward: {
      type: String,
      trim: true,
    },
    bedNumber: {
      type: String,
      trim: true,
    },
    visitDate: {
      type: Date,
      default: Date.now,
      index: true,
    },
    admissionDate: {
      type: String,
    },
    dischargeDate: {
      type: String,
    },
    diagnosis: {
      type: String,
      trim: true,
    },
    presentingComplaints: {
      type: String,
    },
    physicalFindings: {
      type: String,
    },
    investigations: {
      type: String,
    },
    treatmentDetails: {
      type: String,
    },
    operationProcedureDetails: {
      type: String,
    },
    opdFindings: {
      type: String,
    },
    courseInHospital: {
      type: String,
    },
    statusOnDischarge: {
      type: String,
      enum: ["Admitted", "Discharged", "Under Treatment", "Pending"],
      default: "Under Treatment",
    },
    doctorComments: {
      type: String,
    },
    dischargeRemarks: {
      type: String,
      trim: true,
    },
    ipNo: {
      type: String,
      trim: true,
    },
    advice: {
      type: String,
    },
    medications: [medicationSchema],
    followUp: followUpSchema,
    histopathology: histopathologySchema,
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  }
);

export const Visit = mongoose.model("Visit", visitSchema);
export default Visit;
