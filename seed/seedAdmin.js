import dotenv from "dotenv";
import mongoose from "mongoose";
import User from "../models/User.js";
import Patient from "../models/Patient.js";
import Visit from "../models/Visit.js";
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
          wardDetails: { ward: "Neurosurgery ICU", bedNumber: "NS-ICU-01" },
          doctorDetails: { doctorName: "Dr. Vikramaditya Roy", departmentName: "Neurosurgery" },
          admissionDetails: { admissionDate: "2026-10-01", dischargeDate: "2026-10-07" },
          diagnosis: { diagnosisDetails: "87.01 - Intracerebral haematoma - Hypertensive", presentingComplaints: "Severe sudden headache with altered sensorium", physicalFindings: "BP: 170/100, SpO2: 95%" },
          investigationDetails: "NCCT Head: Left basal ganglia bleed with surrounding edema",
          treatment: { treatmentDetails: "Decongestants, IV Mannitol, strict BP control.", operationProcedureDetails: "Conservative neurosurgical management" },
          opdFindings: "Stable, vitals normal.",
          courseInHospital: "Monitored in Neurosurgery ICU. Hemodynamically stable.",
          status: "Discharged",
          statusOnDischarge: "Discharged",
          doctorComments: "Advised strict BP monitoring.",
          medications: [{ medicine: "Tab. Telmisartan", dosage: "40mg", frequency: "Once Daily (OD)", duration: "3 Months", instructions: "Morning after food" }]
        },
        {
          crNo: "CR-2026-00002",
          personalDetails: { name: "Priyanka Verma", fatherGuardianName: "Anil Verma", age: 29, gender: "Female", dob: "1997-08-22" },
          contactDetails: { mobile: "9123456789", email: "priyanka.v@example.com", address: "Flat 402, Royal Palms", city: "Lucknow", state: "Uttar Pradesh", pincode: "226024" },
          hospitalDetails: { hospitalNumber: "HOSP-88491", patientNumber: "P-10043" },
          wardDetails: { ward: "Neurosurgery General ward 2", bedNumber: "NS-GW2-04" },
          doctorDetails: { doctorName: "Dr. Sanjay Bhattacharya", departmentName: "Neurosurgery" },
          admissionDetails: { admissionDate: "2026-10-06", dischargeDate: "" },
          diagnosis: { diagnosisDetails: "107.01 - Meningioma - Convexity", presentingComplaints: "Focal motor seizures and headache for 1 month", physicalFindings: "GCS 15/15, no motor deficit" },
          investigationDetails: "MRI Brain (Contrast): Right frontal convexity dural based enhancing lesion.",
          treatment: { treatmentDetails: "Pre-op antiepileptics. Craniotomy planned.", operationProcedureDetails: "Right Frontal Craniotomy & Total Excision of Meningioma" },
          opdFindings: "Surgical wound clean.",
          courseInHospital: "Patient tolerated surgery well. Mobilized in ward.",
          status: "Admitted",
          statusOnDischarge: "Admitted",
          doctorComments: "Surgical wound clean. Sutures intact.",
          medications: [{ medicine: "Tab. Levetiracetam", dosage: "500mg", frequency: "Twice Daily (BD)", duration: "1 Month", instructions: "After meals" }]
        },
        {
          crNo: "CR-2026-00003",
          personalDetails: { name: "Amitabh Sen", fatherGuardianName: "Debashis Sen", age: 52, gender: "Male", dob: "1974-02-18" },
          contactDetails: { mobile: "9834567812", email: "amitabh.sen@example.com", address: "B-12 Gomti Nagar", city: "Lucknow", state: "Uttar Pradesh", pincode: "226010" },
          hospitalDetails: { hospitalNumber: "HOSP-88492", patientNumber: "P-10044" },
          wardDetails: { ward: "Neurosurgery General ward 1", bedNumber: "NS-GW1-02" },
          doctorDetails: { doctorName: "Dr. Vikramaditya Roy", departmentName: "Neurosurgery" },
          admissionDetails: { admissionDate: "2026-10-08", dischargeDate: "" },
          diagnosis: { diagnosisDetails: "157.03 - Cervical spondylosis - With myelopathy", presentingComplaints: "Neck pain radiating to bilateral hands and gait imbalance", physicalFindings: "Spastic quadriparesis, brisk deep tendon reflexes" },
          investigationDetails: "MRI Cervical Spine: C4-C5, C5-C6 disc osteophyte complex with cord compression.",
          treatment: { treatmentDetails: "Cervical collar, analgesics.", operationProcedureDetails: "C3-C6 Cervical Laminectomy and Decompression" },
          opdFindings: "Stable, improving power.",
          courseInHospital: "Post-op recovery smooth. Ambulating with support.",
          status: "Admitted",
          statusOnDischarge: "Admitted",
          doctorComments: "Avoid jerky neck movements, limb physiotherapy advised.",
          medications: [{ medicine: "Tab. Pregabalin", dosage: "75mg", frequency: "At Bedtime (HS)", duration: "15 Days", instructions: "After dinner" }]
        },
        {
          crNo: "CR-2026-00004",
          personalDetails: { name: "Baby Aarav Gupta", fatherGuardianName: "Sunil Gupta", age: 6, gender: "Male", dob: "2020-09-10" },
          contactDetails: { mobile: "9789012345", email: "sunil.gupta@example.com", address: "Plot 89, Indira Nagar", city: "Lucknow", state: "Uttar Pradesh", pincode: "226016" },
          hospitalDetails: { hospitalNumber: "HOSP-88493", patientNumber: "P-10045" },
          wardDetails: { ward: "Neurosurgery Pediatrics ward", bedNumber: "NS-PED-01" },
          doctorDetails: { doctorName: "Dr. Ananya Sengupta", departmentName: "Neurosurgery" },
          admissionDetails: { admissionDate: "2026-10-09", dischargeDate: "" },
          diagnosis: { diagnosisDetails: "10.00 - Aqueductal obstruction", presentingComplaints: "Headache, morning vomiting, increasing head circumference", physicalFindings: "Bulging fontanelle, sunset sign present" },
          investigationDetails: "MRI Brain: Triventricular hydrocephalus with aqueductal stenosis.",
          treatment: { treatmentDetails: "Endoscopic Third Ventriculostomy performed.", operationProcedureDetails: "Endoscopic Third Ventriculostomy (ETV)" },
          opdFindings: "Active, feeding normally, headache subsided.",
          courseInHospital: "Tolerating oral feeds well, afebrile.",
          status: "Under Treatment",
          statusOnDischarge: "Under Treatment",
          doctorComments: "Monitor head circumference and signs of raised ICP.",
          medications: [{ medicine: "Syp. Paracetamol", dosage: "5ml", frequency: "As Needed (SOS)", duration: "3 Days", instructions: "After feeds" }]
        },
        {
          crNo: "CR-2026-00005",
          personalDetails: { name: "Kusum Lata Dixit", fatherGuardianName: "Hari Mohan Dixit", age: 61, gender: "Female", dob: "1965-11-04" },
          contactDetails: { mobile: "9654321098", email: "kusum.dixit@example.com", address: "55 Alambagh", city: "Lucknow", state: "Uttar Pradesh", pincode: "226005" },
          hospitalDetails: { hospitalNumber: "HOSP-88494", patientNumber: "P-10046" },
          wardDetails: { ward: "Neurosurgery HDU", bedNumber: "NS-HDU-03" },
          doctorDetails: { doctorName: "Dr. Sanjay Bhattacharya", departmentName: "Neurosurgery" },
          admissionDetails: { admissionDate: "2026-10-10", dischargeDate: "" },
          diagnosis: { diagnosisDetails: "45.00 - Chronic subdural haematoma (CSDH)", presentingComplaints: "Progressive headache and drowsiness following minor fall 3 weeks ago", physicalFindings: "GCS 13/15, mild left hemiparesis" },
          investigationDetails: "NCCT Head: Right crescentic hypodense subdural collection with 7mm midline shift.",
          treatment: { treatmentDetails: "Burr hole drainage under local anesthesia with sedation.", operationProcedureDetails: "Right Parietal Burr Hole Evacuation & Subdural Drain" },
          opdFindings: "GCS 15/15, motor weakness completely resolved.",
          courseInHospital: "Drain removed after 48 hours. Shifted to Neurosurgery HDU.",
          status: "Admitted",
          statusOnDischarge: "Admitted",
          doctorComments: "Adequate hydration, repeat CT scan before discharge.",
          medications: [{ medicine: "Tab. Levetiracetam", dosage: "500mg", frequency: "Twice Daily (BD)", duration: "1 Month", instructions: "After meals" }]
        },
        {
          crNo: "CR-2026-00006",
          personalDetails: { name: "Ratan Lal Maurya", fatherGuardianName: "Chhedi Lal Maurya", age: 58, gender: "Male", dob: "1968-07-15" },
          contactDetails: { mobile: "9456789012", email: "ratan.maurya@example.com", address: "Vill. Bakshi Ka Talab", city: "Lucknow", state: "Uttar Pradesh", pincode: "226001" },
          hospitalDetails: { hospitalNumber: "HOSP-88495", patientNumber: "P-10047" },
          wardDetails: { ward: "Neurosurgery General ward 1", bedNumber: "NS-GW1-05" },
          doctorDetails: { doctorName: "Dr. Vikramaditya Roy", departmentName: "Neurosurgery" },
          admissionDetails: { admissionDate: "2026-10-11", dischargeDate: "" },
          diagnosis: { diagnosisDetails: "54.01 - Post-traumatic Disc prolapse", presentingComplaints: "Severe low backache radiating to right leg with tingling", physicalFindings: "SLR test positive at 40 degrees on right" },
          investigationDetails: "MRI Lumbar Spine: L4-L5 disc extrusion with right L5 nerve root compression.",
          treatment: { treatmentDetails: "Conservative therapy failed. Microdiscectomy performed.", operationProcedureDetails: "Right L4-L5 Microlumbar Discectomy" },
          opdFindings: "Radicular pain completely relieved.",
          courseInHospital: "Post-op recovery uneventful. Ambulated same day.",
          status: "Admitted",
          statusOnDischarge: "Admitted",
          doctorComments: "Avoid forward bending and heavy lifting for 6 weeks.",
          medications: [{ medicine: "Tab. Zerodol-SP", dosage: "100mg", frequency: "Twice Daily (BD)", duration: "5 Days", instructions: "After meals" }]
        },
        {
          crNo: "CR-2026-00007",
          ipNo: "IP-2026-0071",
          personalDetails: { name: "Anand Vikram Singh", fatherGuardianName: "Raghavendra Singh", age: 38, gender: "Male", dob: "1988-03-12" },
          contactDetails: { mobile: "9812345678", email: "anand.singh@example.com", address: "Sector 14, Vikas Nagar", city: "Lucknow", state: "Uttar Pradesh", pincode: "226022" },
          hospitalDetails: { hospitalNumber: "HOSP-99011", patientNumber: "P-20011" },
          wardDetails: { ward: "Neurosurgery ICU", bedNumber: "NS-ICU-02" },
          doctorDetails: { doctorName: "Dr. Vikramaditya Roy", departmentName: "Neurosurgery" },
          admissionDetails: { admissionDate: "2026-10-14", dischargeDate: "" },
          diagnosis: { diagnosisDetails: "104.01 - Glioblastoma Multiforme (GBM)", presentingComplaints: "Severe progressive headache with projectile vomiting and focal seizures for 2 weeks", physicalFindings: "GCS 14/15, bilateral papilledema present, right hemiparesis Grade 4/5" },
          investigationDetails: "MRI Brain (Contrast): Large heterogeneously enhancing mass in left fronto-parietal region with mass effect and 6mm midline shift.",
          treatment: { treatmentDetails: "IV Mannitol, Dexamethasone, Levetiracetam. Craniotomy planned.", operationProcedureDetails: "Left Frontoparietal Craniotomy & Near Total Tumor Excision" },
          opdFindings: "Post-op GCS 15/15. Hemiparesis improved to 4+/5.",
          courseInHospital: "Patient shifted to Neurosurgery ICU post-extubation. Vitals stable. Wound dressing clean.",
          status: "Admitted",
          statusOnDischarge: "Admitted",
          doctorComments: "Histopathology report awaited. Continue anti-edema measures.",
          dischargeRemarks: "Admitted in Neurosurgery ICU under active post-operative care and monitoring.",
          medications: [
            { medicine: "Tab. Levetiracetam", dosage: "500mg", frequency: "Twice Daily (BD)", duration: "1 Month", instructions: "After food" },
            { medicine: "Inj. Dexamethasone", dosage: "4mg", frequency: "Thrice Daily (TDS)", duration: "5 Days", instructions: "IV slowly" }
          ]
        },
        {
          crNo: "CR-2026-00008",
          ipNo: "IP-2026-0085",
          personalDetails: { name: "Sunita Maurya", fatherGuardianName: "Kailash Nath Maurya", age: 48, gender: "Female", dob: "1978-06-25" },
          contactDetails: { mobile: "9723456789", email: "sunita.maurya@example.com", address: "A-54 Indira Nagar", city: "Lucknow", state: "Uttar Pradesh", pincode: "226016" },
          hospitalDetails: { hospitalNumber: "HOSP-99012", patientNumber: "P-20012" },
          wardDetails: { ward: "Neurosurgery General ward 1", bedNumber: "NS-GW1-06" },
          doctorDetails: { doctorName: "Dr. Sanjay Bhattacharya", departmentName: "Neurosurgery" },
          admissionDetails: { admissionDate: "2026-10-12", dischargeDate: "2026-10-18" },
          diagnosis: { diagnosisDetails: "155.01 - Trigeminal Neuralgia", presentingComplaints: "Severe electric-shock-like lancinating right facial pain triggered by chewing and brushing for 8 months", physicalFindings: "Hyperesthesia in right V2-V3 dermatome. Cranial nerves otherwise intact." },
          investigationDetails: "High-resolution 3D FIESTA MRI Brain: Neurovascular conflict noted between Superior Cerebellar Artery (SCA) and right Trigeminal nerve root entry zone.",
          treatment: { treatmentDetails: "Medical therapy with Carbamazepine previously inadequate. Microvascular Decompression performed.", operationProcedureDetails: "Right Retromastoid Suboccipital Craniectomy & Microvascular Decompression (MVD) with Teflon felt insertion" },
          opdFindings: "Complete pain relief achieved immediately post-op.",
          courseInHospital: "Uneventful post-operative recovery in Neurosurgery General ward 1. Ambulating well without vertigo.",
          status: "Discharged",
          statusOnDischarge: "Discharged",
          doctorComments: "Facial pain completely resolved. Surgical scar healthy.",
          dischargeRemarks: "Patient discharged in conscious, alert, and pain-free condition. Suture removal advised in OPD after 7 days.",
          medications: [
            { medicine: "Tab. Paracetamol", dosage: "650mg", frequency: "As Needed (SOS)", duration: "5 Days", instructions: "After food" },
            { medicine: "Tab. Pantoprazole", dosage: "40mg", frequency: "Once Daily (OD)", duration: "10 Days", instructions: "Before breakfast" }
          ]
        }
      ];

      for (const dp of demoPatients) {
        await Patient.updateOne({ crNo: dp.crNo }, { $set: dp }, { upsert: true });
      }

      // Cleanup: Ensure ANY existing patient record in database ONLY has one of the 5 allowed wards
      const allowedWards = [
        "Neurosurgery General ward 1",
        "Neurosurgery General ward 2",
        "Neurosurgery HDU",
        "Neurosurgery ICU",
        "Neurosurgery Pediatrics ward",
      ];
      await Patient.updateMany(
        { "wardDetails.ward": { $nin: allowedWards } },
        { $set: { "wardDetails.ward": "Neurosurgery General ward 1" } }
      );
      await Visit.updateMany(
        { ward: { $nin: allowedWards } },
        { $set: { ward: "Neurosurgery General ward 1" } }
      );

      console.log(`[Seed Success]: Demo patients synced and all wards migrated strictly to the 5 Neurosurgery wards!`);


    process.exit(0);
  } catch (error) {
    console.error("[Seed Error]:", error);
    process.exit(1);
  }
};

seedAdminUser();
