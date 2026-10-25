// names.js — local lists used to build realistic fakes: Indian first names
// (male/female), surnames, streets, areas and cities, in English and in
// Devanagari (Hindi and Marathi). Nothing here is downloaded; it is all in the extension.

(function () {
  const MaskIN = (globalThis.MaskIN = globalThis.MaskIN || {});

  MaskIN.names = {
    en: {
      male: [
        "Suresh", "Amit", "Rahul", "Vijay", "Anil", "Sanjay", "Rohan", "Nikhil", "Arjun", "Manoj",
        "Prakash", "Deepak", "Ajay", "Kiran", "Rajesh", "Sachin", "Vivek", "Ashok", "Mahesh", "Ganesh",
        "Harish", "Naveen", "Pankaj", "Tushar", "Yogesh", "Abhishek", "Gaurav", "Hemant", "Imran", "Farhan",
        "Karthik", "Venkat", "Siddharth", "Aditya", "Omkar", "Pranav", "Sameer", "Tarun", "Vikas", "Dinesh"
      ],
      female: [
        "Sunita", "Priya", "Anjali", "Neha", "Pooja", "Kavita", "Meena", "Sneha", "Asha", "Rekha",
        "Swati", "Pallavi", "Shweta", "Divya", "Nisha", "Rashmi", "Seema", "Vandana", "Archana", "Madhuri",
        "Shilpa", "Komal", "Deepa", "Gauri", "Ritu", "Sakshi", "Tanvi", "Aarti", "Bhavna", "Farah",
        "Lakshmi", "Revathi", "Ishita", "Manisha", "Payal", "Rupali", "Smita", "Varsha", "Yamini", "Zoya"
      ],
      surnames: [
        "Patil", "Sharma", "Verma", "Deshmukh", "Joshi", "Kulkarni", "Gupta", "Singh", "Yadav", "Pawar",
        "Jadhav", "Shinde", "Mane", "Kale", "Mehta", "Shah", "Iyer", "Nair", "Reddy", "Rao",
        "Chavan", "Bhosale", "Gaikwad", "Mishra", "Pandey", "Tiwari", "Saxena", "Agarwal", "Bansal", "Kapoor",
        "Malhotra", "Chopra", "Menon", "Pillai", "Das", "Bose", "Banerjee", "Khan", "Qureshi", "Fernandes"
      ],
      streets: [
        "MG Road", "Station Road", "Gandhi Nagar Road", "Nehru Marg", "Tilak Road", "Shivaji Path",
        "Ambedkar Chowk Road", "Church Street", "Market Road", "Lake View Road", "College Road",
        "Temple Street", "Hill Road", "Link Road", "Ring Road", "Mill Road"
      ],
      areas: [
        "Shivaji Nagar", "Kothrud", "Andheri East", "Indira Nagar", "Model Colony", "Civil Lines",
        "Rajendra Nagar", "Laxmi Nagar", "Ganesh Peth", "Sadashiv Peth", "Malviya Nagar", "Vasant Vihar",
        "Shastri Nagar", "Ram Nagar", "Azad Colony", "Saraswati Colony"
      ],
      buildings: ["Flat", "House No.", "Plot", "Room"]
    },

    hi: {
      male: [
        "सुरेश", "अमित", "राहुल", "विजय", "अनिल", "संजय", "रोहन", "निखिल", "अर्जुन", "मनोज",
        "प्रकाश", "दीपक", "अजय", "राजेश", "विवेक", "अशोक", "महेश", "हरीश", "नवीन", "पंकज",
        "गौरव", "हेमंत", "विकास", "दिनेश", "आदित्य"
      ],
      female: [
        "सुनीता", "प्रिया", "अंजलि", "नेहा", "पूजा", "कविता", "मीना", "स्नेहा", "आशा", "रेखा",
        "स्वाति", "श्वेता", "दिव्या", "निशा", "रश्मि", "सीमा", "वंदना", "अर्चना", "शिल्पा", "कोमल",
        "दीपा", "ऋतु", "साक्षी", "आरती", "भावना"
      ],
      surnames: [
        "शर्मा", "वर्मा", "गुप्ता", "सिंह", "यादव", "मिश्रा", "पांडेय", "तिवारी", "सक्सेना", "अग्रवाल",
        "चौहान", "राठौर", "श्रीवास्तव", "दुबे", "त्रिपाठी", "चौधरी", "मौर्य", "जैन", "कपूर", "बंसल"
      ],
      streets: ["महात्मा गांधी मार्ग", "स्टेशन रोड", "नेहरू मार्ग", "तिलक मार्ग", "मंदिर मार्ग", "बाज़ार रोड", "कॉलेज रोड", "झील मार्ग"],
      areas: ["राजेंद्र नगर", "शास्त्री नगर", "सिविल लाइंस", "मालवीय नगर", "इंदिरा नगर", "लक्ष्मी नगर", "आज़ाद कॉलोनी", "राम नगर"],
      buildings: ["मकान नं.", "फ्लैट", "प्लॉट"]
    },

    mr: {
      male: [
        "सुरेश", "अमित", "राहुल", "विजय", "अनिल", "संजय", "रोहन", "निखिल", "सचिन", "गणेश",
        "प्रकाश", "दीपक", "अजय", "किरण", "महेश", "योगेश", "तुषार", "ओंकार", "प्रणव", "समीर",
        "अभिजीत", "मंगेश", "संतोष", "विठ्ठल", "शंकर"
      ],
      female: [
        "सुनीता", "प्रिया", "अंजली", "नेहा", "पूजा", "कविता", "मीना", "स्नेहा", "आशा", "रेखा",
        "स्वाती", "पल्लवी", "माधुरी", "गौरी", "तन्वी", "रुपाली", "स्मिता", "वर्षा", "मनीषा", "अर्चना",
        "शुभांगी", "वैशाली", "सायली", "अश्विनी", "प्राजक्ता"
      ],
      surnames: [
        "पाटील", "देशमुख", "जोशी", "कुलकर्णी", "पवार", "जाधव", "शिंदे", "मोरे", "काळे", "चव्हाण",
        "भोसले", "गायकवाड", "देशपांडे", "गोखले", "सावंत", "राणे", "कदम", "माने", "थोरात", "साळुंखे"
      ],
      streets: ["महात्मा गांधी रस्ता", "स्टेशन रस्ता", "टिळक रस्ता", "शिवाजी पथ", "मंदिर रस्ता", "बाजार रस्ता", "कॉलेज रस्ता", "तलाव रस्ता"],
      areas: ["शिवाजी नगर", "कोथरूड", "सदाशिव पेठ", "गणेश पेठ", "मॉडेल कॉलनी", "राजेंद्र नगर", "शास्त्री नगर", "सरस्वती कॉलनी"],
      buildings: ["घर क्र.", "फ्लॅट", "प्लॉट"]
    },

    // City names in both scripts with the first 3 digits of a matching PIN code.
    cities: [
      { en: "Pune", hi: "पुणे", mr: "पुणे", pin: "411" },
      { en: "Nashik", hi: "नासिक", mr: "नाशिक", pin: "422" },
      { en: "Nagpur", hi: "नागपुर", mr: "नागपूर", pin: "440" },
      { en: "Mumbai", hi: "मुंबई", mr: "मुंबई", pin: "400" },
      { en: "Thane", hi: "ठाणे", mr: "ठाणे", pin: "400" },
      { en: "Kolhapur", hi: "कोल्हापुर", mr: "कोल्हापूर", pin: "416" },
      { en: "Aurangabad", hi: "औरंगाबाद", mr: "औरंगाबाद", pin: "431" },
      { en: "Satara", hi: "सतारा", mr: "सातारा", pin: "415" },
      { en: "Jaipur", hi: "जयपुर", mr: "जयपूर", pin: "302" },
      { en: "Lucknow", hi: "लखनऊ", mr: "लखनौ", pin: "226" },
      { en: "Bhopal", hi: "भोपाल", mr: "भोपाळ", pin: "462" },
      { en: "Indore", hi: "इंदौर", mr: "इंदूर", pin: "452" },
      { en: "Patna", hi: "पटना", mr: "पाटणा", pin: "800" },
      { en: "Ahmedabad", hi: "अहमदाबाद", mr: "अहमदाबाद", pin: "380" },
      { en: "Bengaluru", hi: "बेंगलुरु", mr: "बंगळुरू", pin: "560" },
      { en: "Hyderabad", hi: "हैदराबाद", mr: "हैदराबाद", pin: "500" }
    ],

    // Words kept as they are when a name is faked ("Mr. Ramesh Kumar" -> "Mr. Suresh Patil").
    titles: [
      "Mr", "Mr.", "Mrs", "Mrs.", "Ms", "Ms.", "Dr", "Dr.", "Shri", "Shri.", "Smt", "Smt.", "Kum.", "Km.",
      "Prof.", "श्री", "श्री.", "श्रीमती", "सौ.", "कु.", "डॉ.", "डॉ"
    ]
  };

  if (typeof module !== "undefined") module.exports = MaskIN.names;
})();
