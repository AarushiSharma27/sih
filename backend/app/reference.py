"""
reference.py -- the master lists behind the cohort.

These mirror the lookup tables in assets/js/data.js. They are the closest thing
this system has to reference data: swapping any of them for a database table is
the intended path to production, which is why nothing below is computed.
"""

from __future__ import annotations

from typing import Any

# `demand` is local labour-market strength -- it moves outcomes, which is why two
# identical trainees in different districts do not fare the same.
DISTRICTS: list[dict[str, Any]] = [
    {"name": "Indore",   "weight": 22, "demand": 1.07, "lat": 22.72, "lon": 75.86},
    {"name": "Bhopal",   "weight": 18, "demand": 1.04, "lat": 23.26, "lon": 77.41},
    {"name": "Jabalpur", "weight": 13, "demand": 0.99, "lat": 23.18, "lon": 79.99},
    {"name": "Gwalior",  "weight": 12, "demand": 0.96, "lat": 26.22, "lon": 78.18},
    {"name": "Ujjain",   "weight": 10, "demand": 1.00, "lat": 23.18, "lon": 75.78},
    {"name": "Sagar",    "weight":  9, "demand": 0.94, "lat": 23.84, "lon": 78.74},
    {"name": "Rewa",     "weight":  8, "demand": 0.91, "lat": 24.53, "lon": 81.30},
    {"name": "Satna",    "weight":  8, "demand": 0.93, "lat": 24.57, "lon": 80.83},
]

COURSES: list[dict[str, Any]] = [
    {"code": "WEB", "name": "Web Development",            "sector": "IT-ITeS",       "duration": 6, "fee": 18000, "weight": 16, "quality": 1.10, "wage": 21500},
    {"code": "DAT", "name": "Data Analytics",             "sector": "IT-ITeS",       "duration": 6, "fee": 22000, "weight": 12, "quality": 1.14, "wage": 24000},
    {"code": "ELE", "name": "Electrician",                "sector": "Power",         "duration": 4, "fee":  9000, "weight": 13, "quality": 1.02, "wage": 16500},
    {"code": "WLD", "name": "Welding Technician",         "sector": "Capital Goods", "duration": 3, "fee":  8000, "weight": 11, "quality": 0.98, "wage": 17200},
    {"code": "HCA", "name": "Healthcare Assistant",       "sector": "Healthcare",    "duration": 5, "fee": 12000, "weight": 10, "quality": 1.06, "wage": 15800},
    {"code": "RSA", "name": "Retail Sales Associate",     "sector": "Retail",        "duration": 2, "fee":  5000, "weight": 12, "quality": 0.90, "wage": 14200},
    {"code": "AUT", "name": "Automotive Service Tech",    "sector": "Automotive",    "duration": 4, "fee": 11000, "weight":  9, "quality": 0.97, "wage": 16800},
    {"code": "BWL", "name": "Beauty & Wellness",          "sector": "Beauty",        "duration": 3, "fee":  7000, "weight":  7, "quality": 0.93, "wage": 13500},
    {"code": "SPV", "name": "Solar PV Technician",        "sector": "Green Energy",  "duration": 3, "fee": 10000, "weight":  6, "quality": 1.04, "wage": 18200},
    {"code": "AMO", "name": "Apparel / Machine Operator", "sector": "Textiles",      "duration": 2, "fee":  4500, "weight":  4, "quality": 0.88, "wage": 12800},
]

PROVIDERS: list[dict[str, Any]] = [
    {"id": "PRV-01", "name": "Skill Sagar Institute",  "city": "Indore",   "quality": 1.12, "centres": 9, "accredited": True,  "rating": 4.4},
    {"id": "PRV-02", "name": "NavSkill Academy",       "city": "Bhopal",   "quality": 1.06, "centres": 7, "accredited": True,  "rating": 4.2},
    {"id": "PRV-03", "name": "Bharat Tech Institute",  "city": "Jabalpur", "quality": 0.97, "centres": 6, "accredited": True,  "rating": 3.8},
    {"id": "PRV-04", "name": "Udyam Skill Centre",     "city": "Gwalior",  "quality": 0.92, "centres": 5, "accredited": False, "rating": 3.4},
    {"id": "PRV-05", "name": "Pragati Training Hub",   "city": "Ujjain",   "quality": 1.01, "centres": 4, "accredited": True,  "rating": 4.0},
    {"id": "PRV-06", "name": "Sanchar Polytechnic",    "city": "Rewa",     "quality": 0.86, "centres": 3, "accredited": False, "rating": 3.1},
]

BATCHES: list[dict[str, Any]] = [
    {"id": "2024-A", "label": "2024 Batch A", "start": "2024-01-15", "ageMonths": 32},
    {"id": "2024-B", "label": "2024 Batch B", "start": "2024-07-10", "ageMonths": 26},
    {"id": "2025-A", "label": "2025 Batch A", "start": "2025-01-20", "ageMonths": 20},
    {"id": "2025-B", "label": "2025 Batch B", "start": "2025-07-14", "ageMonths": 14},
    {"id": "2026-A", "label": "2026 Batch A", "start": "2026-01-12", "ageMonths":  8},
]

EMPLOYERS: list[dict[str, Any]] = [
    {"id": "EMP-101", "name": "Aarav Technologies Pvt Ltd", "sector": "IT-ITeS",       "district": "Indore",   "size": "250-500", "verified": True,  "gstin": "23AABCA1234F1Z5", "contact": "Neha Raghuvanshi", "email": "hr@aaravtech.in",          "phone": "+91 98260 11234", "hires": 0, "rating": 4.5},
    {"id": "EMP-102", "name": "Malwa Motors Service",       "sector": "Automotive",    "district": "Indore",   "size": "50-250",  "verified": True,  "gstin": "23AACCM5678K1Z2", "contact": "Rakesh Yadav",     "email": "careers@malwamotors.in",   "phone": "+91 98931 55210", "hires": 0, "rating": 4.0},
    {"id": "EMP-103", "name": "Narmada Health Services",    "sector": "Healthcare",    "district": "Bhopal",   "size": "500+",    "verified": True,  "gstin": "23AAECN9012L1Z8", "contact": "Dr. Shalini Nair", "email": "people@narmadahealth.org", "phone": "+91 75520 30011", "hires": 0, "rating": 4.3},
    {"id": "EMP-104", "name": "Vindhya Steel Works",        "sector": "Capital Goods", "district": "Jabalpur", "size": "250-500", "verified": True,  "gstin": "23AAFCV3456M1Z1", "contact": "Imran Qureshi",    "email": "hr@vindhyasteel.com",      "phone": "+91 76940 88220", "hires": 0, "rating": 3.7},
    {"id": "EMP-105", "name": "Shivaay Retail Mart",        "sector": "Retail",        "district": "Gwalior",  "size": "50-250",  "verified": False, "gstin": "23AAGCS7890N1Z4", "contact": "Priya Sharma",     "email": "jobs@shivaayretail.in",    "phone": "+91 78690 44190", "hires": 0, "rating": 3.5},
    {"id": "EMP-106", "name": "SunGrid Solar Solutions",    "sector": "Green Energy",  "district": "Ujjain",   "size": "50-250",  "verified": True,  "gstin": "23AAHCS2345P1Z7", "contact": "Vikram Patel",     "email": "talent@sungrid.co.in",     "phone": "+91 99930 12876", "hires": 0, "rating": 4.1},
    {"id": "EMP-107", "name": "Kaveri Apparel Exports",     "sector": "Textiles",      "district": "Indore",   "size": "250-500", "verified": True,  "gstin": "23AAJCK6789Q1Z3", "contact": "Meena Joshi",      "email": "hr@kaveriapparel.in",      "phone": "+91 94250 77310", "hires": 0, "rating": 3.6},
    {"id": "EMP-108", "name": "Satpura Power Services",     "sector": "Power",         "district": "Sagar",    "size": "500+",    "verified": True,  "gstin": "23AAKCS1122R1Z9", "contact": "Anil Deshmukh",    "email": "recruit@satpurapower.in",  "phone": "+91 78050 66142", "hires": 0, "rating": 4.2},
    {"id": "EMP-109", "name": "GlowUp Salon Chain",         "sector": "Beauty",        "district": "Bhopal",   "size": "10-50",   "verified": False, "gstin": "23AALCG3344S1Z6", "contact": "Rhea Kapoor",      "email": "hello@glowupsalon.in",     "phone": "+91 90090 23477", "hires": 0, "rating": 3.3},
    {"id": "EMP-110", "name": "DataBridge Analytics",       "sector": "IT-ITeS",       "district": "Bhopal",   "size": "50-250",  "verified": True,  "gstin": "23AAMCD5566T1Z0", "contact": "Sourabh Mishra",   "email": "hiring@databridge.ai",     "phone": "+91 88170 90512", "hires": 0, "rating": 4.6},
    {"id": "EMP-111", "name": "Rewa Agro Equipments",       "sector": "Capital Goods", "district": "Rewa",     "size": "10-50",   "verified": False, "gstin": "23AANCR7788U1Z2", "contact": "Suresh Tiwari",    "email": "office@rewaagro.in",       "phone": "+91 70000 31284", "hires": 0, "rating": 3.2},
    {"id": "EMP-112", "name": "Satna Cement Logistics",     "sector": "Logistics",     "district": "Satna",    "size": "250-500", "verified": True,  "gstin": "23AAOCS9900V1Z5", "contact": "Farhan Ali",       "email": "hr@satnacement.in",        "phone": "+91 82250 74400", "hires": 0, "rating": 3.9},
]

NON_PLACEMENT_REASONS: list[dict[str, Any]] = [
    {"code": "SKILL",    "label": "Lack of required skills",     "weight": 24},
    {"code": "EXP",      "label": "Lack of experience",          "weight": 19},
    {"code": "INTV",     "label": "Poor interview performance",  "weight": 14},
    {"code": "NOJOB",    "label": "No suitable jobs nearby",     "weight": 16},
    {"code": "SALARY",   "label": "Salary expectations",         "weight": 11},
    {"code": "PERSONAL", "label": "Personal / relocation issues", "weight": 10},
    {"code": "RELEV",    "label": "Course not relevant",         "weight":  6},
]

# Industry demand vs what the curriculum actually teaches.
SKILL_GAPS: list[dict[str, Any]] = [
    {"course": "Web Development",         "industry": ["HTML/CSS", "JavaScript", "React", "Git", "REST APIs", "SQL", "Cloud Deploy"], "taught": ["HTML/CSS", "JavaScript", "React"],              "demandIndex": 88},
    {"course": "Data Analytics",          "industry": ["Excel", "SQL", "Python", "Power BI", "Statistics", "Cloud"],                  "taught": ["Excel", "Python", "Statistics"],                "demandIndex": 92},
    {"course": "Electrician",             "industry": ["Wiring", "Motor control", "PLC basics", "Safety cert", "Solar wiring"],       "taught": ["Wiring", "Motor control", "Safety cert"],       "demandIndex": 74},
    {"course": "Welding Technician",      "industry": ["ARC", "MIG", "TIG", "Blueprint reading", "NDT basics"],                       "taught": ["ARC", "MIG", "Blueprint reading"],              "demandIndex": 71},
    {"course": "Healthcare Assistant",    "industry": ["Patient care", "Vitals", "EMR entry", "Infection control", "Basic life support"], "taught": ["Patient care", "Vitals", "Infection control"], "demandIndex": 80},
    {"course": "Retail Sales Associate",  "industry": ["Customer handling", "POS billing", "Inventory app", "Spoken English", "Upselling"], "taught": ["Customer handling", "POS billing", "Inventory app"], "demandIndex": 63},
    {"course": "Automotive Service Tech", "industry": ["Engine service", "EV basics", "Diagnostics tool", "Customer handling"],       "taught": ["Engine service", "Diagnostics tool"],           "demandIndex": 77},
    {"course": "Solar PV Technician",     "industry": ["Panel install", "Inverter config", "Site survey", "Rooftop safety", "Net metering"], "taught": ["Panel install", "Inverter config", "Rooftop safety"], "demandIndex": 84},
]

FIRST_M = ["Aarav", "Rohit", "Imran", "Suresh", "Vikram", "Ankit", "Deepak", "Manish", "Rahul", "Sahil", "Ravi", "Karan", "Nitin", "Arjun", "Farhan", "Pankaj", "Amit", "Sandeep", "Yash", "Harsh", "Gaurav", "Mohit", "Abhishek", "Kunal", "Devendra"]
FIRST_F = ["Priya", "Neha", "Anjali", "Kavita", "Pooja", "Shalini", "Meena", "Ritu", "Sunita", "Divya", "Rekha", "Swati", "Aarti", "Nisha", "Farida", "Sneha", "Komal", "Preeti", "Jyoti", "Radha", "Bhavna", "Asha", "Manisha", "Tanvi", "Isha"]
LAST = ["Sharma", "Verma", "Yadav", "Patel", "Jain", "Mishra", "Tiwari", "Rathore", "Chouhan", "Solanki", "Malviya", "Gupta", "Khan", "Ansari", "Nayak", "Dubey", "Pandey", "Thakur", "Rajput", "Kushwaha", "Bairagi", "Sisodiya", "Dangi", "Ahirwar"]

OUTCOMES: dict[str, dict[str, str]] = {
    "employed":   {"label": "Employed (wage)", "color": "var(--series-1)"},
    "self":       {"label": "Self-employed",   "color": "var(--series-3)"},
    "apprentice": {"label": "Apprenticeship",  "color": "var(--series-4)"},
    "notplaced":  {"label": "Not placed",      "color": "var(--series-8)"},
}

SEED = 20260917
COHORT_SIZE = 10000
FOLLOW_WAVES = ["3m", "6m", "12m", "24m"]
FOLLOW_DUE_MONTHS = [3, 6, 12, 24]
FILTER_KEYS = ["course", "district", "batch", "provider", "outcome", "gender"]
