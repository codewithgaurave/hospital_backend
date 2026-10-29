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

const fileSchema = new mongoose.Schema(
  {
    filename: String,
    originalName: String,
    mimeType: String,
    size: Number,
    path: String,
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const patientSchema = new mongoose.Schema(
  {
    crNo: {
      type: String,
      required: [true, "CR Number is required"],
      unique: true,
      index: true,
      trim: true,
    },
    ipNo: {
      type: String,
      index: true,
      trim: true,
    },
    personalDetails: {
      name: { type: String, required: [true, "Patient name is required"], trim: true },
      fatherGuardianName: { type: String, trim: true },
      age: { type: Number },
      gender: { type: String, enum: ["Male", "Female", "Other"], default: "Male" },
      dob: { type: String },
    },
    contactDetails: {
      mobile: { 
        type: String, 
        required: [true, "Mobile number is required"], 
        match: [/^[6-9]\d{9}$/, "Mobile number must be exactly 10 digits starting with 6, 7, 8, or 9"],
        index: true, 
        trim: true 
      },
      email: { type: String, trim: true },
      address: { type: String },
      city: { type: String, default: "Lucknow" },
      state: { type: String, default: "Uttar Pradesh" },
      pincode: { type: String },
    },
    hospitalDetails: {
      hospitalNumber: { type: String, index: true },
      patientNumber: { type: String },
      ipNumber: { type: String, index: true },
    },
    wardDetails: {
      ward: { type: String, default: "General Ward" },
      bedNumber: { type: String },
    },
    doctorDetails: {
      doctorId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      doctorName: { type: String, default: "Dr. Vikramaditya Roy" },
      departmentId: { type: String },
      departmentName: { type: String, default: "Cardiology" },
    },
    admissionDetails: {
      admissionDate: { type: String, index: true },
      dischargeDate: { type: String },
    },
    diagnosis: {
      diagnosisDetails: { type: String },
      presentingComplaints: { type: String },
      physicalFindings: { type: String },
    },
    investigationDetails: { type: String },
    treatment: {
      treatmentDetails: { type: String },
      operationProcedureDetails: { type: String },
    },
    opdFindings: { type: String },
    courseInHospital: { type: String },
    statusOnDischarge: { type: String, default: "Admitted", index: true },
    doctorComments: { type: String },
    dischargeRemarks: { type: String, trim: true },
    medications: [medicationSchema],
    followUp: {
      date: { type: String },
      instructions: { type: String },
      notes: { type: String },
    },
    histopathologyDetails: { type: String },
    files: [fileSchema],
    status: {
      type: String,
      enum: ["Admitted", "Discharged", "Under Treatment", "Pending"],
      default: "Admitted",
      index: true,
    },
    isArchived: {
      type: Boolean,
      default: false,
      index: true,
    },
    archivedAt: {
      type: Date,
    },
    archivedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  {
    timestamps: true,
  }
);

// Ensure status and statusOnDischarge, and ipNo remain synchronized
patientSchema.pre("save", function (next) {
  if (this.isModified("status") && !this.isModified("statusOnDischarge")) {
    this.statusOnDischarge = this.status;
  } else if (this.isModified("statusOnDischarge") && !this.isModified("status")) {
    this.status = this.statusOnDischarge;
  } else if (!this.status && this.statusOnDischarge) {
    this.status = this.statusOnDischarge;
  } else if (this.status && !this.statusOnDischarge) {
    this.statusOnDischarge = this.status;
  }

  if (this.ipNo && (!this.hospitalDetails || !this.hospitalDetails.ipNumber)) {
    if (!this.hospitalDetails) this.hospitalDetails = {};
    this.hospitalDetails.ipNumber = this.ipNo;
  } else if (this.hospitalDetails?.ipNumber && !this.ipNo) {
    this.ipNo = this.hospitalDetails.ipNumber;
  }

  next();
});

// Indexes for high performance searching
patientSchema.index({ "personalDetails.name": "text", crNo: "text", ipNo: "text", "contactDetails.mobile": "text" });

// High-speed compound indexes for instant sorting & filtering
patientSchema.index({ isArchived: 1, createdAt: -1 });
patientSchema.index({ isArchived: 1, status: 1, createdAt: -1 });
patientSchema.index({ isArchived: 1, statusOnDischarge: 1, createdAt: -1 });
patientSchema.index({ isArchived: 1, "personalDetails.name": 1 });
patientSchema.index({ isArchived: 1, "contactDetails.mobile": 1 });
patientSchema.index({ isArchived: 1, "doctorDetails.doctorName": 1 });
patientSchema.index({ isArchived: 1, "doctorDetails.departmentName": 1 });
patientSchema.index({ isArchived: 1, "wardDetails.ward": 1 });

export const Patient = mongoose.model("Patient", patientSchema);
export default Patient;
