require('dotenv').config();
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { GoogleAIFileManager } = require('@google/generative-ai/server');

const app = express();
const port = 3000;

const apiKey = process.env.API_KEY;
const genAI = new GoogleGenerativeAI(apiKey);
const fileManager = new GoogleAIFileManager(apiKey);

// 파일 업로드를 위한 메모리 저장소 설정
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 루트 디렉토리의 index.html 파일 제공
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// 임시 디렉터리가 있는지 확인
const tempDir = path.join(__dirname, 'temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir);
}

// 파일 업로드 및 처리를 처리하는 엔드포인트
app.post('/upload', upload.single('image'), async (req, res) => {
  const tempFilePath = path.join(tempDir, `${Date.now()}_${req.file.originalname}`);
  try {
    const fileBuffer = req.file.buffer;
    const mimeType = req.file.mimetype;

    // 임시 파일 경로 생성
    fs.writeFileSync(tempFilePath, fileBuffer);

    // Gemini에 파일 업로드
    const uploadResult = await fileManager.uploadFile(tempFilePath, {
      mimeType,
      displayName: req.file.originalname,
    });
    const file = uploadResult.file;

    // 임시 파일 삭제
    fs.unlinkSync(tempFilePath);

    // 모델과의 채팅 세션 시작
    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-pro',
      systemInstruction: `He's an expert in the age-old art of impressionism, which is the art of recognizing an animal by its facial features, habits, and behavior. He can also give you advice.
It is not to evaluate people by comparing them to animals, but to recognize their characteristics. Always make sure to answer in the affirmative. Responses should be in JSON format and should not include additional comments. You must always provide a type and reason, regardless of image quality or other factors.
example

  {"category": "Cat", "reason": "It has a calm and mysterious aura. It has a great sense of artistic flair, and has a charm that makes you feel comfortable around it."},
  {"category": "Dog", "reason": "It has a warm and friendly vibe. They give positive energy to those around them, and are bright and cheerful."}
  {"category": "Rabbit", "reason": "You have a cute and loving aura. They are sensitive and caring, and bring joy to those around them."},
  {"category": "Owl", "reason": "You have a wise and sensible aura. You are insightful and conscientious, constantly working toward your goals."}
  {"category": "Fox", "reason": "You have a mesmerizing and clever aura. You are quick-witted and adaptable, handling different situations with flexibility."}
  {"category": "Deer", "reason": "You have an elegant and pure aura. You are sensitive and sensitive to your surroundings."}
  {"category": "Bear", "reason": "You have a sturdy and trustworthy aura; you have a warm heart and are a reassuring presence to those around you."}
  {"category": "Wolf", "reason": "You have a charismatic and independent aura. You have strong leadership skills and are tenacious in pursuit of your goals."}
  {"category": "Penguin Award", "reason": "Has a neat and tidy appearance. You are polite and organized, and you are a sociable person who lives in harmony with the people around you."}
  {"category": "Koala", "reason": "You have a peaceful and gentle aura. They are stress-resistant and have a calm personality that brings comfort to those around them."}
  {"category": "Monkey", "reason": "You have a witty and energetic personality. You are curious and adaptable, and you are a cheerful person who can keep your humor in any situation."},
  {"category": "Lion", "reason": "You have an assertive and confident aura. You are charismatic and have a leadership personality that bravely moves toward your goals."}
  {"category": "Giraffe", "reason": "You have an elegant and noble air; you have a broad outlook and insight; you are a generous personality who embraces those around you."}
  {"category": "Elephant", "reason": "Has a gentle and wise aura. They have a good memory and are empathetic and caring for those around them."}

Example of unwanted response (Never respond like this)
  {"category": "undefined", "reason": "Unknown"}

\n`,
    });

    const generationConfig = {
      temperature: 2,
      topP: 0.95,
      topK: 64,
      maxOutputTokens: 8192,
      responseMimeType: 'application/json',
    };

    const chatSession = model.startChat({
      generationConfig,
      history: [
        {
          role: 'user',
          parts: [
            {
              fileData: {
                mimeType: file.mimeType,
                fileUri: file.uri,
              },
            },
          ],
        },
      ],
    });

    const result = await chatSession.sendMessage('Please Tell us the animal in the image');
    const response = JSON.parse(result.response.text());

    res.json({ category: response.category, reason: response.reason });
  } catch (error) {
    // 임시 파일이 존재하면 삭제
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
    console.error('Error during image processing:', error);
    res.status(500).json({ error: 'An error occurred while processing the image.', details: error.message });
  }
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
