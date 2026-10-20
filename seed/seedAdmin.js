import dotenv from "dotenv";
import mongoose from "mongoose";
import User from "../models/User.js";
import Patient from "../models/Patient.js";
import { connectDB } from "../config/db.js";

dotenv.config();

const seedAdminUser = async () => {
  try {
    await connectDB();

    const adminEmail = process.env.ADMIN_SEED_EMAIL || "admin@digicoders-health.com";
    const adminPassword = process.env.ADMIN_SEED_PASSWORD || "Admin@2026!";

    // Check if admin already exists
    const existingAdmin = await User.findOne({ email: adminEmail });

    if (existingAdmin) {
      console.log(`[Seed]: Admin user already exists with email: ${adminEmail}`);
    } else {
      const admin = await User.create({
        name: "Dr. Saurabh Kumar",
        email: adminEmail,
        password: adminPassword,
        phone: "+91 98765 00000",
        role: "admin",
        department: "Hospital Administration & IT",
        avatar: "https://images.unsplash.com/photo-1622253692010-333f2da6031d?w=300&auto=format&fit=crop",
        isActive: true,
      });

      console.log(`[Seed Success]: Admin user created!`);
      console.log(`Email: ${admin.email}`);
      console.log(`Password: ${adminPassword}`);
    }

    // Seed or update Initial Demo Patients
    const demoPatients = [
        {
          crNo: "CR-2026-00001",
          personalDetails: { name: "Rajesh Kumar Sharma", fatherGuardianName: "Rameshwar Sharma", age: 45, gender: "Male", dob: "1981-05-14" },
          contactDetails: { mobile: "9876543210", email: "rajesh.sharma@example.com", address: "H.No 142, Vivek Khand", city: "Lucknow", state: "Uttar Pradesh", pincode: "226010" },
          hospitalDetails: { hospitalNumber: "HOSP-88490", patientNumber: "P-10042" },
          wardDetails: { ward: "ICU / Cardiac Care Unit", bedNumber: "CCU-04" },
          doctorDetails: { doctorName: "Dr. Vikramaditya Roy", departmentName: "Cardiology" },
          admissionDetails: { admissionDate: "2026-10-01", dischargeDate: "2026-10-07" },
          diagnosis: { diagnosisDetails: "Acute Anterior Wall Myocardial Infarction (STEMI)", presentingComplaints: "Severe retrosternal chest pain for 3 hours", physicalFindings: "BP: 150/95, SpO2: 94%" },
          investigationDetails: "ECG: ST elevation V1-V4. Troponin-I: High Positive",
          treatment: { treatmentDetails: "Thrombolysis with Streptokinase. Dual antiplatelets.", operationProcedureDetails: "Emergency PCI to LAD with 1 DES stent." },
          opdFindings: "Post-PCI stable.",
          courseInHospital: "Monitored in CCU for 48 hours. Hemodynamically stable.",
          status: "Discharged",
          statusOnDischarge: "Discharged",
          doctorComments: "Advised strict adherence to dual antiplatelets.",
          medications: [{ medicine: "Tab. Ecosprin", dosage: "75mg", frequency: "Once Daily (OD)", duration: "3 Months", instructions: "After food" }]
        },
        {
          crNo: "CR-2026-00002",
          personalDetails: { name: "Priyanka Verma", fatherGuardianName: "Anil Verma", age: 29, gender: "Female", dob: "1997-08-22" },
          contactDetails: { mobile: "9123456789", email: "priyanka.v@example.com", address: "Flat 402, Royal Palms", city: "Lucknow", state: "Uttar Pradesh", pincode: "226024" },
          hospitalDetails: { hospitalNumber: "HOSP-88491", patientNumber: "P-10043" },
          wardDetails: { ward: "Female Surgical Ward", bedNumber: "FSW-12" },
          doctorDetails: { doctorName: "Dr. Shalini Srivastava", departmentName: "General Surgery" },
          admissionDetails: { admissionDate: "2026-10-06", dischargeDate: "" },
          diagnosis: { diagnosisDetails: "Acute Suppurative Appendicitis", presentingComplaints: "RLQ abdominal pain, fever (101°F)", physicalFindings: "Tender at McBurney's point" },
          investigationDetails: "USG Abdomen: Inflamed appendix 9.2mm. TLC: 14,800/mm³",
          treatment: { treatmentDetails: "Pre-op IV Antibiotics.", operationProcedureDetails: "Laparoscopic Appendectomy." },
          opdFindings: "Port site clean.",
          courseInHospital: "Patient tolerated surgery well. Soft diet resumed.",
          status: "Admitted",
          statusOnDischarge: "Admitted",
          doctorComments: "Surgical wound clean.",
          medications: [{ medicine: "Inj. Augmentin", dosage: "1.2g", frequency: "Twice Daily (BD)", duration: "3 Days", instructions: "IV" }]
        },
        {
          crNo: "CR-2026-00003",
          personalDetails: { name: "Amitabh Sen", fatherGuardianName: "Debashis Sen", age: 52, gender: "Male", dob: "1974-02-18" },
          contactDetails: { mobile: "9834567812", email: "amitabh.sen@example.com", address: "B-12 Gomti Nagar", city: "Lucknow", state: "Uttar Pradesh", pincode: "226010" },
          hospitalDetails: { hospitalNumber: "HOSP-88492", patientNumber: "P-10044" },
          wardDetails: { ward: "Male Medical Ward", bedNumber: "MMW-05" },
          doctorDetails: { doctorName: "Dr. Alok Nath Tripathy", departmentName: "Orthopedics" },
          admissionDetails: { admissionDate: "2026-10-08", dischargeDate: "" },
          diagnosis: { diagnosisDetails: "Closed Fracture Neck of Femur (Right)", presentingComplaints: "Inability to bear weight after domestic fall", physicalFindings: "Shortening and external rotation of right leg" },
          investigationDetails: "X-Ray Pelvis with Both Hips: Transcervical fracture neck femur",
          treatment: { treatmentDetails: "Skin traction applied. Cemented Bipolar Hemiarthroplasty planned.", operationProcedureDetails: "Right Bipolar Hemiarthroplasty" },
          opdFindings: "Stable, pre-op evaluation complete.",
          courseInHospital: "Patient operated under spinal anesthesia. Mobilized with walker.",
          status: "Admitted",
          statusOnDischarge: "Admitted",
          doctorComments: "Weight bearing as tolerated with walker.",
          medications: [{ medicine: "Tab. Dynapar AQ", dosage: "75mg", frequency: "Twice Daily (BD)", duration: "5 Days", instructions: "After food" }]
        },
        {
          crNo: "CR-2026-00004",
          personalDetails: { name: "Baby Aarav Gupta", fatherGuardianName: "Sunil Gupta", age: 6, gender: "Male", dob: "2020-09-10" },
          contactDetails: { mobile: "9789012345", email: "sunil.gupta@example.com", address: "Plot 89, Indira Nagar", city: "Lucknow", state: "Uttar Pradesh", pincode: "226016" },
          hospitalDetails: { hospitalNumber: "HOSP-88493", patientNumber: "P-10045" },
          wardDetails: { ward: "Private Deluxe Ward", bedNumber: "PDW-02" },
          doctorDetails: { doctorName: "Dr. Ananya Sengupta", departmentName: "Pediatrics" },
          admissionDetails: { admissionDate: "2026-10-09", dischargeDate: "" },
          diagnosis: { diagnosisDetails: "Acute Bronchopneumonia with Wheeze", presentingComplaints: "High fever, rapid breathing and cough for 4 days", physicalFindings: "Bilateral crepitations, subcostal retractions" },
          investigationDetails: "Chest X-Ray: Bilateral patchy consolidations. SpO2: 92% room air.",
          treatment: { treatmentDetails: "O2 via nasal prongs, Nebulization with Duolin and Budecort.", operationProcedureDetails: "Conservative medical management" },
          opdFindings: "Wheeze decreasing, SpO2 98% on room air.",
          courseInHospital: "Tolerating oral feeds well, afebrile for 24 hours.",
          status: "Under Treatment",
          statusOnDischarge: "Under Treatment",
          doctorComments: "Continue inhaler therapy for 1 week.",
          medications: [{ medicine: "Syp. Augmentin Duo", dosage: "5ml", frequency: "Twice Daily (BD)", duration: "5 Days", instructions: "After meals" }]
        },
        {
          crNo: "CR-2026-00005",
          personalDetails: { name: "Kusum Lata Dixit", fatherGuardianName: "Hari Mohan Dixit", age: 61, gender: "Female", dob: "1965-11-04" },
          contactDetails: { mobile: "9654321098", email: "kusum.dixit@example.com", address: "55 Alambagh", city: "Lucknow", state: "Uttar Pradesh", pincode: "226005" },
          hospitalDetails: { hospitalNumber: "HOSP-88494", patientNumber: "P-10046" },
          wardDetails: { ward: "Emergency Trauma Ward", bedNumber: "ETW-03" },
          doctorDetails: { doctorName: "Dr. Pradeep Verma", departmentName: "General Medicine" },
          admissionDetails: { admissionDate: "2026-10-10", dischargeDate: "" },
          diagnosis: { diagnosisDetails: "Type 2 Diabetes Mellitus with Hyperosmolar Hyperglycemic State", presentingComplaints: "Altered sensorium, extreme dehydration, polyuria", physicalFindings: "GCS 13/15, dry tongue, tachycardia" },
          investigationDetails: "Random Blood Sugar: 620 mg/dL. Urine Ketones: Negative. Serum Osmolality: 335 mOsm/kg",
          treatment: { treatmentDetails: "Aggressive IV Normal Saline rehydration. Regular Insulin infusion protocol.", operationProcedureDetails: "ICU stabilization" },
          opdFindings: "Blood glucose normalized to 160 mg/dL.",
          courseInHospital: "Shifted to step-down ward after stabilization.",
          status: "Admitted",
          statusOnDischarge: "Admitted",
          doctorComments: "Dietary restriction and insulin titration.",
          medications: [{ medicine: "Inj. Human Mixtard", dosage: "16-0-12 U", frequency: "Twice Daily (BD)", duration: "Ongoing", instructions: "30 mins before meals" }]
        },
        {
          crNo: "CR-2026-00006",
          personalDetails: { name: "Ratan Lal Maurya", fatherGuardianName: "Chhedi Lal Maurya", age: 58, gender: "Male", dob: "1968-07-15" },
          contactDetails: { mobile: "9456789012", email: "ratan.maurya@example.com", address: "Vill. Bakshi Ka Talab", city: "Lucknow", state: "Uttar Pradesh", pincode: "226201" },
          hospitalDetails: { hospitalNumber: "HOSP-88495", patientNumber: "P-10047" },
          wardDetails: { ward: "General Medical Ward", bedNumber: "GMW-09" },
          doctorDetails: { doctorName: "Dr. Meenakshi Sundaram", departmentName: "Surgery" },
          admissionDetails: { admissionDate: "2026-10-11", dischargeDate: "" },
          diagnosis: { diagnosisDetails: "Right Inguinal Hernia (Direct) with Histopathology Evaluation", presentingComplaints: "Groin swelling on coughing for 6 months", physicalFindings: "Expansile cough impulse present" },
          investigationDetails: "Ultrasound Scrotum & Groin: Inguinal hernia defect 2.1cm. Biopsy tissue sent for Histopathology.",
          treatment: { treatmentDetails: "Lichtenstein Mesh Hernioplasty under spinal anesthesia.", operationProcedureDetails: "Open Mesh Repair & Tissue Biopsy" },
          opdFindings: "Incision healthy.",
          courseInHospital: "Post-op recovery uneventful. Biopsy report awaited.",
          status: "Admitted",
          statusOnDischarge: "Admitted",
          doctorComments: "Avoid heavy lifting for 6 weeks.",
          medications: [{ medicine: "Tab. Zerodol-SP", dosage: "100mg", frequency: "Twice Daily (BD)", duration: "5 Days", instructions: "After meals" }]
        }
      ];

      for (const dp of demoPatients) {
        await Patient.updateOne({ crNo: dp.crNo }, { $set: dp }, { upsert: true });
      }
      console.log(`[Seed Success]: Demo patients synced!`);

    process.exit(0);
  } catch (error) {
    console.error("[Seed Error]:", error);
    process.exit(1);
  }
};

seedAdminUser();
