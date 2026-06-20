import AsyncStorage from "@react-native-async-storage/async-storage";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Notifications from "expo-notifications";
import * as Speech from "expo-speech";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { defaultMarkdown } from "./defaultMarkdown";

type Screen = "home" | "import" | "material" | "day" | "study" | "reminders";

type SourceInfo = {
  chapter: string;
  sectionPath: string;
  paragraph: string;
  label: string;
};

type CardQuestion = {
  id: string;
  prompt: string;
  answer: string;
};

type Card = {
  id: string;
  title: string;
  content: string;
  question: string;
  source: SourceInfo;
  order: number;
  introducedOn: string;
  due: string;
  stage: number;
  reviewed: number;
  correctStreak: number;
  reviewState: "new" | "learning" | "relearning" | "review" | "mature";
  learningStep: number;
  intervalDays: number;
  easeFactor: number;
  lapses: number;
  lastReviewedOn?: string;
};

type DayEntry = {
  day: string;
  cards: Card[];
  done: number;
  total: number;
};

type Material = {
  id: string;
  name: string;
  markdown: string;
  pace: number;
  cards: Card[];
  createdAt: string;
};

type ReminderTime = {
  id: string;
  hour: number;
  minute: number;
  enabled: boolean;
};

type StudyPhase = "reading" | "question" | "answer" | "done";

const MATERIALS_STORAGE_KEY = "beiguo_materials_v1";
const REMINDERS_STORAGE_KEY = "beiguo_reminders_v1";
const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";
const DEEPSEEK_API_KEY = process.env.EXPO_PUBLIC_DEEPSEEK_API_KEY || "";

const defaultReminderTimes: ReminderTime[] = [
  { id: "09-00", hour: 9, minute: 0, enabled: true },
  { id: "16-00", hour: 16, minute: 0, enabled: true },
  { id: "21-00", hour: 21, minute: 0, enabled: true },
];

const LEARNING_STEPS = [1, 3, 7];
const RELEARNING_STEPS = [1, 2];
const GRADUATING_INTERVAL = 6;
const MATURE_THRESHOLD = 21;
const MIN_EASE_FACTOR = 1.3;
const MAX_EASE_FACTOR = 3.0;

const uid = () => Math.random().toString(36).slice(2, 10);

const todayISO = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const nowStamp = () => {
  const d = new Date();
  return `${todayISO()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

const normalizeText = (text: string) =>
  text
    .replace(/\r/g, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

const toSpeechText = (text: string) =>
  normalizeText(text)
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+[.)]\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[>#_~]/g, "")
    .replace(/\n+/g, "。")
    .replace(/。{2,}/g, "。")
    .trim();

const inferQuestion = (content: string, title: string) => {
  if (/(本质特征|基本特征|主要特征|特点)/.test(content)) {
    return `${title}的本质特征或主要特点有哪些？`;
  }
  if (/(定义|概念|含义|是指)/.test(content)) {
    return `${title}是什么？请概括它的核心含义。`;
  }
  if (/(原因|为什么)/.test(content)) {
    return `${title}的原因是什么？`;
  }
  if (/(意义|影响|作用)/.test(content)) {
    return `${title}有什么意义、影响或作用？`;
  }
  if (/(措施|方法|路径|要求|必须|应当)/.test(content)) {
    return `围绕${title}，应该采取哪些措施或遵循哪些要求？`;
  }
  if (/(包括|分为|主要有|如下|一是|二是|三是|1\.|2\.|3\.)/.test(content)) {
    return `${title}包括哪些方面？`;
  }
  return `如果你是出题人，会怎样提问“${title}”这一节的关键内容？`;
};

const splitCardContent = (content: string) => {
  const lines = normalizeText(content).split("\n").filter(Boolean);
  const chunks: string[] = [];
  let current = "";

  for (const line of lines) {
    const next = current ? `${current}\n${line}` : line;
    if (next.length > 140 && current) {
      chunks.push(current);
      current = line;
    } else {
      current = next;
    }
  }

  if (current) chunks.push(current);
  return chunks.length ? chunks : [normalizeText(content)];
};

const materialNameFromMarkdown = (markdown: string) => {
  const lines = normalizeText(markdown).split("\n");
  const heading = lines.find((line) => /^#\s+/.test(line));
  if (heading) {
    return heading.replace(/^#\s+/, "").trim();
  }
  const firstLine = lines.find((line) => line.trim());
  return (firstLine || "未命名材料").slice(0, 24);
};

const formatReminderTime = (hour: number, minute: number) =>
  `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;

const parseReminderInput = (value: string) => {
  const match = value.trim().match(/^(\d{1,2}):(\d{1,2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
};

const sortReminders = (items: ReminderTime[]) =>
  [...items].sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute));

const parseMarkdownToCards = (markdown: string, pace: number) => {
  const text = normalizeText(markdown);
  const lines = text.split("\n");
  const path: string[] = [];
  const sections: Array<{ path: string[]; title: string; lines: string[]; paragraph: number }> = [];
  let current: { path: string[]; title: string; lines: string[]; paragraph: number } | null = null;
  let paragraph = 1;

  const pushCurrent = () => {
    if (current && normalizeText(current.lines.join("\n"))) {
      sections.push(current);
    }
  };

  lines.forEach((raw) => {
    const line = raw.trim();
    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      pushCurrent();
      const level = heading[1].length;
      const title = heading[2].trim();
      path[level - 1] = title;
      path.length = level;
      paragraph = 1;
      current = { path: [...path], title, lines: [], paragraph };
      return;
    }

    if (!line) {
      paragraph += 1;
      return;
    }

    if (!current) {
      current = { path: ["正文"], title: "正文", lines: [], paragraph };
    }

    current.lines.push(line);
  });

  pushCurrent();

  const start = todayISO();
  return sections.map((section, index) => {
    const introDay = Math.floor(index / Math.max(1, pace));
    const content = normalizeText(section.lines.join("\n"));
    const sectionPath = section.path.join(" / ");
    const source = {
      chapter: section.path[0] || "正文",
      sectionPath,
      paragraph: `P${section.paragraph}`,
      label: `-${section.path.join("-")}`,
    };

    return {
      id: uid(),
      title: section.title,
      content,
      question: inferQuestion(content, section.title),
      source,
      order: index,
      introducedOn: addDays(start, introDay),
      due: addDays(start, introDay),
      stage: 0,
      reviewed: 0,
      correctStreak: 0,
      reviewState: "new" as const,
      learningStep: 0,
      intervalDays: 0,
      easeFactor: 2.5,
      lapses: 0,
    };
  });
};

const groupByDay = (cards: Card[]): DayEntry[] => {
  const map = new Map<string, Card[]>();
  cards.forEach((card) => {
    const day = card.introducedOn;
    if (!map.has(day)) map.set(day, []);
    map.get(day)!.push(card);
  });

  return Array.from(map.entries())
    .map(([day, dayCards]) => ({
      day,
      cards: dayCards.sort((a, b) => a.order - b.order),
      done: dayCards.filter((card) => card.lastReviewedOn).length,
      total: dayCards.length,
    }))
    .sort((a, b) => a.day.localeCompare(b.day));
};

const getTodayQueue = (cards: Card[]) => {
  const today = todayISO();
  return cards
    .filter((card) => card.introducedOn === today || card.due <= today)
    .sort((a, b) => a.order - b.order);
};

const getStateLabel = (card: Card) => {
  switch (card.reviewState) {
    case "new":
      return "新卡";
    case "learning":
      return "学习中";
    case "relearning":
      return "重学中";
    case "review":
      return "间隔复习";
    case "mature":
      return "熟练";
    default:
      return "待开始";
  }
};

const scheduleNextReview = (card: Card, score: number, today: string) => {
  let reviewState = card.reviewState;
  let learningStep = card.learningStep;
  let intervalDays = card.intervalDays;
  let easeFactor = card.easeFactor;
  let lapses = card.lapses;
  const reviewed = card.reviewed + 1;
  const correctStreak = score >= 4 ? card.correctStreak + 1 : 0;

  if (score <= 1) {
    lapses += 1;
    easeFactor = Math.max(MIN_EASE_FACTOR, easeFactor - 0.2);
    reviewState = card.reviewState === "new" || card.reviewState === "learning" ? "learning" : "relearning";
    learningStep = 0;
    intervalDays = RELEARNING_STEPS[0];
  } else if (card.reviewState === "new" || card.reviewState === "learning" || card.reviewState === "relearning") {
    const steps = card.reviewState === "relearning" ? RELEARNING_STEPS : LEARNING_STEPS;

    if (score === 3) {
      reviewState = card.reviewState === "relearning" ? "relearning" : "learning";
      intervalDays = steps[Math.min(learningStep, steps.length - 1)];
      easeFactor = Math.max(MIN_EASE_FACTOR, easeFactor - 0.03);
    } else {
      learningStep += 1;
      easeFactor = Math.min(MAX_EASE_FACTOR, easeFactor + 0.05);
      if (learningStep >= steps.length) {
        intervalDays = GRADUATING_INTERVAL;
        reviewState = intervalDays >= MATURE_THRESHOLD ? "mature" : "review";
      } else {
        intervalDays = steps[learningStep];
        reviewState = card.reviewState === "relearning" ? "relearning" : "learning";
      }
    }
  } else {
    if (score === 3) {
      intervalDays = Math.max(intervalDays + 1, Math.round(intervalDays * 1.35));
      easeFactor = Math.max(MIN_EASE_FACTOR, easeFactor - 0.05);
    } else {
      intervalDays = Math.max(intervalDays + 1, Math.round(intervalDays * easeFactor));
      easeFactor = Math.min(MAX_EASE_FACTOR, easeFactor + 0.08);
    }
    reviewState = intervalDays >= MATURE_THRESHOLD ? "mature" : "review";
  }

  return {
    ...card,
    reviewed,
    correctStreak,
    reviewState,
    learningStep,
    intervalDays,
    easeFactor,
    lapses,
    due: addDays(today, Math.max(1, intervalDays)),
    lastReviewedOn: today,
    stage: learningStep,
  };
};

const inlineMarkdown = (text: string) => {
  const nodes: React.ReactNode[] = [];
  const parts = text.split(/(\*\*[^*]+\*\*)/g);

  parts.forEach((part, index) => {
    const strong = part.match(/^\*\*([^*]+)\*\*$/);
    if (strong) {
      nodes.push(
        <Text key={`${part}-${index}`} style={styles.strong}>
          {strong[1]}
        </Text>
      );
      return;
    }

    if (part) {
      nodes.push(<Text key={`${part}-${index}`}>{part}</Text>);
    }
  });

  return nodes;
};

const MarkdownBlock = ({ content }: { content: string }) => {
  const lines = normalizeText(content).split("\n");

  return (
    <View style={styles.markdownBlock}>
      {lines.map((line, index) => {
        const h = line.match(/^(#{1,4})\s+(.+)$/);
        const ul = line.match(/^[-*+]\s+(.+)$/);
        const ol = line.match(/^(\d+)[.)]\s+(.+)$/);

        if (h) {
          return (
            <Text key={index} style={styles[`h${Math.min(4, h[1].length)}` as keyof typeof styles]}>
              {h[2]}
            </Text>
          );
        }

        if (ul) {
          return (
            <Text key={index} style={styles.markdownLine}>
              {"• "}
              {inlineMarkdown(ul[1])}
            </Text>
          );
        }

        if (ol) {
          return (
            <Text key={index} style={styles.markdownLine}>
              {`${ol[1]}. `}
              {inlineMarkdown(ol[2])}
            </Text>
          );
        }

        return (
          <Text key={index} style={styles.markdownLine}>
            {inlineMarkdown(line)}
          </Text>
        );
      })}
    </View>
  );
};

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function scheduleDailyReminders(reminders: ReminderTime[]) {
  if (Platform.OS === "web") return { ok: false, scheduled: 0, granted: false };

  const current = await Notifications.getPermissionsAsync();
  let finalStatus = current.status;

  if (current.status !== "granted") {
    const requested = await Notifications.requestPermissionsAsync();
    finalStatus = requested.status;
  }

  if (finalStatus !== "granted") {
    return { ok: false, scheduled: 0, granted: false };
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("study-reminders", {
      name: "背诵提醒",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#0f8f8a",
    });
  }

  await Notifications.cancelAllScheduledNotificationsAsync();

  let scheduled = 0;
  for (const reminder of reminders.filter((item) => item.enabled)) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "背过提醒",
        body: `${formatReminderTime(reminder.hour, reminder.minute)}，该背诵了。`,
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: reminder.hour,
        minute: reminder.minute,
        channelId: Platform.OS === "android" ? "study-reminders" : undefined,
      },
    });
    scheduled += 1;
  }

  return { ok: true, scheduled, granted: true };
}

const buildMaterial = (name: string, markdown: string, pace: number): Material => ({
  id: uid(),
  name,
  markdown,
  pace,
  cards: parseMarkdownToCards(markdown, pace),
  createdAt: nowStamp(),
});

const buildLocalQuestionSet = (card: Card): CardQuestion[] => {
  const chunks = splitCardContent(card.content);
  const questions: CardQuestion[] = [];

  chunks.forEach((chunk, index) => {
    questions.push({
      id: `${card.id}-${index}`,
      prompt: index === 0 ? card.question : `请继续概括这部分内容的关键点：${card.title}`,
      answer: chunk,
    });
  });

  return questions;
};

export default function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const [draftMarkdown, setDraftMarkdown] = useState(defaultMarkdown);
  const [draftName, setDraftName] = useState(materialNameFromMarkdown(defaultMarkdown));
  const [pace, setPace] = useState("4");
  const [materials, setMaterials] = useState<Material[]>(() => [
    buildMaterial(materialNameFromMarkdown(defaultMarkdown), defaultMarkdown, 4),
  ]);
  const [selectedMaterialId, setSelectedMaterialId] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState(todayISO());
  const [studyQueue, setStudyQueue] = useState<Card[]>([]);
  const [studyIndex, setStudyIndex] = useState(0);
  const [studyPhase, setStudyPhase] = useState<StudyPhase>("reading");
  const [studyQuestions, setStudyQuestions] = useState<CardQuestion[]>([]);
  const [studyQuestionIndex, setStudyQuestionIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [importMessage, setImportMessage] = useState("支持选择 .md、.markdown 和 .txt 文件");
  const [pasteExpanded, setPasteExpanded] = useState(false);
  const [reminders, setReminders] = useState<ReminderTime[]>(defaultReminderTimes);
  const [newReminderTime, setNewReminderTime] = useState("09:00");
  const [materialPaceDraft, setMaterialPaceDraft] = useState("4");
  const [notificationStatus, setNotificationStatus] = useState("未检查");
  const [scheduledReminderCount, setScheduledReminderCount] = useState(0);
  const [speechRate, setSpeechRate] = useState(1);
  const [speechStatus, setSpeechStatus] = useState<"idle" | "speaking" | "ready">("idle");
  const [questionLoading, setQuestionLoading] = useState(false);
  const [recognizing, setRecognizing] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [voiceAvailable, setVoiceAvailable] = useState<boolean | null>(null);
  const hasLoadedStorage = useRef(false);
  const studyCardIdRef = useRef<string | null>(null);

  useSpeechRecognitionEvent("start", () => setRecognizing(true));
  useSpeechRecognitionEvent("end", () => setRecognizing(false));
  useSpeechRecognitionEvent("result", (event) => {
    const text = event.results?.[0]?.transcript || "";
    setLiveTranscript(text);
    if (event.isFinal) {
      setAnswer(text);
    }
  });
  useSpeechRecognitionEvent("error", () => {
    setRecognizing(false);
  });

  const selectedMaterial = useMemo(
    () => materials.find((material) => material.id === selectedMaterialId) || materials[0] || null,
    [materials, selectedMaterialId]
  );
  const currentCards = selectedMaterial?.cards || [];
  const currentDayEntries = useMemo(() => groupByDay(currentCards), [currentCards]);
  const currentTodayQueue = useMemo(() => getTodayQueue(currentCards), [currentCards]);
  const activeCard = studyQueue[studyIndex] || null;
  const activeQuestion = studyQuestions[studyQuestionIndex] || null;
  const selectedDayCards = useMemo(
    () => currentCards.filter((card) => card.introducedOn === selectedDay).sort((a, b) => a.order - b.order),
    [currentCards, selectedDay]
  );
  const totalTasks = materials.reduce((sum, material) => sum + material.cards.length, 0);
  const totalDone = materials.reduce(
    (sum, material) => sum + material.cards.filter((card) => card.reviewState === "mature").length,
    0
  );
  const enabledReminderCount = reminders.filter((item) => item.enabled).length;

  useEffect(() => {
    try {
      setVoiceAvailable(ExpoSpeechRecognitionModule.isRecognitionAvailable());
    } catch {
      setVoiceAvailable(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [savedMaterials, savedReminders] = await Promise.all([
          AsyncStorage.getItem(MATERIALS_STORAGE_KEY),
          AsyncStorage.getItem(REMINDERS_STORAGE_KEY),
        ]);

        if (savedMaterials) {
          const parsed = JSON.parse(savedMaterials) as Material[];
          if (parsed.length) {
            setMaterials(parsed);
            setSelectedMaterialId(parsed[0].id);
          }
        }

        if (savedReminders) {
          const parsed = JSON.parse(savedReminders) as ReminderTime[];
          if (parsed.length) {
            setReminders(sortReminders(parsed));
          }
        }
      } catch {
        Alert.alert("读取本地数据失败", "将继续使用默认内容。");
      } finally {
        hasLoadedStorage.current = true;
      }
    })();
  }, []);

  useEffect(() => {
    if (!selectedMaterialId && materials[0]) {
      setSelectedMaterialId(materials[0].id);
    }
  }, [materials, selectedMaterialId]);

  useEffect(() => {
    if (selectedMaterial) {
      setMaterialPaceDraft(String(selectedMaterial.pace));
    }
  }, [selectedMaterial?.id]);

  useEffect(() => {
    if (!hasLoadedStorage.current) return;
    AsyncStorage.setItem(MATERIALS_STORAGE_KEY, JSON.stringify(materials)).catch(() => undefined);
  }, [materials]);

  useEffect(() => {
    if (!hasLoadedStorage.current) return;
    AsyncStorage.setItem(REMINDERS_STORAGE_KEY, JSON.stringify(reminders)).catch(() => undefined);
    scheduleDailyReminders(reminders)
      .then((result) => {
        if (Platform.OS === "web") {
          setNotificationStatus("Web 不支持本地通知");
          setScheduledReminderCount(0);
          return;
        }
        setNotificationStatus(result.granted ? "已授权" : "未授权");
        setScheduledReminderCount(result.scheduled);
      })
      .catch(() => setNotificationStatus("排程失败"));
  }, [reminders]);

  useEffect(() => {
    if (!activeCard || studyPhase !== "reading") return;
    if (studyCardIdRef.current === activeCard.id && speechStatus === "ready") return;
    studyCardIdRef.current = activeCard.id;
    setSpeechStatus("ready");
    setStudyQuestions([]);
    setStudyQuestionIndex(0);
    setAnswer("");
    setLiveTranscript("");
  }, [activeCard?.id, studyPhase]);

  const saveMaterial = (name: string, markdown: string, nextPace: number) => {
    const cleanMarkdown = normalizeText(markdown);
    if (!cleanMarkdown) {
      Alert.alert("无法生成计划", "材料内容不能为空。");
      return;
    }

    const materialName = name.trim() || materialNameFromMarkdown(cleanMarkdown);
    const material = buildMaterial(materialName, cleanMarkdown, nextPace);
    setMaterials((prev) => [material, ...prev]);
    setSelectedMaterialId(material.id);
    setSelectedDay(material.cards[0]?.introducedOn || todayISO());
    setDraftMarkdown(cleanMarkdown);
    setDraftName(materialName);
    setScreen("material");
    setImportMessage(`已保存材料：${materialName}`);
  };

  const generatePlan = () => {
    saveMaterial(draftName, draftMarkdown, Number(pace) || 4);
  };

  const importTextFile = async () => {
    try {
      setImportMessage("正在读取文件...");
      const result = await DocumentPicker.getDocumentAsync({
        type: ["text/markdown", "text/plain", "*/*"],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled || !result.assets?.length) {
        setImportMessage("已取消选择文件");
        return;
      }

      const asset = result.assets[0];
      const lowerName = asset.name.toLowerCase();
      const allowed = [".md", ".markdown", ".txt"];
      const matched = allowed.some((ext) => lowerName.endsWith(ext));

      if (!matched) {
        setImportMessage("目前先支持 .md、.markdown 和 .txt 文件");
        return;
      }

      let content = "";
      if (Platform.OS === "web") {
        if (!asset.file) throw new Error("浏览器没有返回可读取的文件对象");
        content = await asset.file.text();
      } else {
        const fileInfo = await FileSystem.getInfoAsync(asset.uri);
        if (!fileInfo.exists) throw new Error("文件已选中，但系统没有提供可读取的本地副本");
        content = await FileSystem.readAsStringAsync(asset.uri, {
          encoding: FileSystem.EncodingType.UTF8,
        });
      }

      const normalized = normalizeText(content);
      if (!normalized) throw new Error("文件内容为空，或当前编码无法识别");

      const inferredName = asset.name.replace(/\.(md|markdown|txt)$/i, "") || materialNameFromMarkdown(normalized);
      setDraftMarkdown(normalized);
      setDraftName(inferredName);
      setPasteExpanded(true);
      setImportMessage(`已导入 ${asset.name}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误";
      setImportMessage(`导入失败：${message}`);
      Alert.alert("导入失败", message);
    }
  };

  const openMaterial = (materialId: string) => {
    const material = materials.find((item) => item.id === materialId);
    if (!material) return;
    setSelectedMaterialId(materialId);
    setSelectedDay(material.cards[0]?.introducedOn || todayISO());
    setScreen("material");
  };

  const updateMaterialPace = () => {
    if (!selectedMaterial) return;
    const nextPace = Math.max(1, Number(materialPaceDraft) || selectedMaterial.pace);
    setMaterials((prev) =>
      prev.map((material) =>
        material.id === selectedMaterial.id
          ? {
              ...material,
              pace: nextPace,
              cards: parseMarkdownToCards(material.markdown, nextPace),
            }
          : material
      )
    );
    setSelectedDay(todayISO());
    Alert.alert("已更新记忆速度", `这份材料已调整为每天 ${nextPace} 个小节。`);
  };

  const deleteMaterial = () => {
    if (!selectedMaterial) return;
    Alert.alert("删除这份日程", `确认删除“${selectedMaterial.name}”及其学习记录吗？`, [
      { text: "取消", style: "cancel" },
      {
        text: "删除",
        style: "destructive",
        onPress: () => {
          setMaterials((prev) => {
            const next = prev.filter((item) => item.id !== selectedMaterial.id);
            if (!next.length) {
              const fallback = buildMaterial(materialNameFromMarkdown(defaultMarkdown), defaultMarkdown, 4);
              setSelectedMaterialId(fallback.id);
              setSelectedDay(fallback.cards[0]?.introducedOn || todayISO());
              setScreen("material");
              return [fallback];
            }
            setSelectedMaterialId(next[0].id);
            setSelectedDay(next[0].cards[0]?.introducedOn || todayISO());
            setScreen("home");
            return next;
          });
        },
      },
    ]);
  };

  const startTodayStudy = () => {
    if (!currentTodayQueue.length) return;
    setStudyQueue(currentTodayQueue);
    setStudyIndex(0);
    setStudyPhase("reading");
    setStudyQuestions([]);
    setStudyQuestionIndex(0);
    setAnswer("");
    setScreen("study");
  };

  const startDayStudy = (day: string) => {
    const queue = currentCards.filter((card) => card.introducedOn === day).sort((a, b) => a.order - b.order);
    if (!queue.length) return;
    setSelectedDay(day);
    setStudyQueue(queue);
    setStudyIndex(0);
    setStudyPhase("reading");
    setStudyQuestions([]);
    setStudyQuestionIndex(0);
    setAnswer("");
    setScreen("study");
  };

  const generateQuestionSet = async (card: Card) => {
    const localQuestions = buildLocalQuestionSet(card);
    setStudyQuestions(localQuestions);

    if (!DEEPSEEK_API_KEY) {
      return;
    }

    try {
      setQuestionLoading(true);
      const response = await fetch(DEEPSEEK_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
        },
        body: JSON.stringify({
          model: "deepseek-chat",
          temperature: 0.4,
          messages: [
            {
              role: "system",
              content:
                "你是一个出题助手。请根据给定的知识卡片内容，按内容块生成多个简洁问题。输出严格 JSON 数组，每个元素包含 prompt 和 answer 两个字段。每个 answer 必须对应原文中的一个块，不要遗漏，不要杜撰。",
            },
            {
              role: "user",
              content: JSON.stringify({
                title: card.title,
                source: card.source.sectionPath,
                chunks: splitCardContent(card.content),
              }),
            },
          ],
          response_format: { type: "json_object" },
        }),
      });

      if (!response.ok) {
        throw new Error(`LLM 请求失败：${response.status}`);
      }

      const data = await response.json();
      const raw = data?.choices?.[0]?.message?.content;
      const parsed = JSON.parse(raw || "{}");
      const items = Array.isArray(parsed?.questions) ? parsed.questions : Array.isArray(parsed) ? parsed : null;

      if (items?.length) {
        const nextQuestions = items
          .map((item: { prompt?: string; answer?: string }, index: number) => ({
            id: `${card.id}-llm-${index}`,
            prompt: normalizeText(item.prompt || ""),
            answer: normalizeText(item.answer || ""),
          }))
          .filter((item: CardQuestion) => item.prompt && item.answer);

        if (nextQuestions.length) {
          setStudyQuestions(nextQuestions);
        }
      }
    } catch {
      // fallback already set
    } finally {
      setQuestionLoading(false);
    }
  };

  const speakCurrentCard = () => {
    if (!activeCard) return;
    Speech.stop();
    setSpeechStatus("speaking");
    Speech.speak(toSpeechText(activeCard.content), {
      language: "zh-CN",
      rate: speechRate,
      onDone: () => {
        setSpeechStatus("idle");
      },
      onStopped: () => {
        setSpeechStatus("idle");
      },
      onError: () => {
        setSpeechStatus("idle");
      },
    });
  };

  const skipReading = async () => {
    Speech.stop();
    setSpeechStatus("idle");
    if (activeCard) {
      await generateQuestionSet(activeCard);
    }
    setStudyQuestionIndex(0);
    setStudyPhase("question");
  };

  const beginQuestionFlow = async () => {
    if (!activeCard) return;
    await generateQuestionSet(activeCard);
    setStudyQuestionIndex(0);
    setStudyPhase("question");
  };

  const startVoiceAnswer = async () => {
    if (Platform.OS === "web" && voiceAvailable === false) {
      Alert.alert("当前浏览器不支持语音识别", "请改用文字输入或在移动端 App 中使用。");
      return;
    }

    const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("语音权限未开启", "请允许麦克风和语音识别权限。");
      return;
    }

    setLiveTranscript("");
    setAnswer("");
    ExpoSpeechRecognitionModule.start({
      lang: "zh-CN",
      interimResults: true,
      continuous: false,
      maxAlternatives: 1,
      addsPunctuation: true,
      contextualStrings: activeQuestion ? [activeQuestion.prompt, activeCard?.title || ""] : undefined,
    });
  };

  const stopVoiceAnswer = () => {
    ExpoSpeechRecognitionModule.stop();
  };

  const nextQuestion = () => {
    if (studyQuestionIndex + 1 >= studyQuestions.length) {
      setStudyPhase("answer");
      return;
    }
    setStudyQuestionIndex((prev) => prev + 1);
    setAnswer("");
    setLiveTranscript("");
  };

  const scoreCard = (score: number) => {
    if (!activeCard || !selectedMaterial) return;
    const today = todayISO();

    setMaterials((prev) =>
      prev.map((material) => {
        if (material.id !== selectedMaterial.id) return material;
        return {
          ...material,
          cards: material.cards.map((card) => (card.id !== activeCard.id ? card : scheduleNextReview(card, score, today))),
        };
      })
    );

    Speech.stop();
    ExpoSpeechRecognitionModule.abort();

    if (studyIndex + 1 >= studyQueue.length) {
      setStudyPhase("done");
      setStudyQueue([]);
      setStudyIndex(0);
      setStudyQuestions([]);
      setStudyQuestionIndex(0);
      return;
    }

    setStudyIndex((prev) => prev + 1);
    setStudyPhase("reading");
    setStudyQuestions([]);
    setStudyQuestionIndex(0);
    setAnswer("");
    setLiveTranscript("");
  };

  const extraCard = () => {
    const today = todayISO();
    const queue = currentCards
      .filter((card) => card.reviewState !== "mature" || card.due <= today)
      .sort((a, b) => {
        const aOverdue = a.due <= today ? 0 : 1;
        const bOverdue = b.due <= today ? 0 : 1;
        return aOverdue - bOverdue || a.reviewed - b.reviewed || a.order - b.order;
      });

    if (!queue.length) return;
    setStudyQueue([queue[0]]);
    setStudyIndex(0);
    setStudyPhase("reading");
    setStudyQuestions([]);
    setStudyQuestionIndex(0);
    setAnswer("");
    setLiveTranscript("");
  };

  const enableNotifications = async () => {
    if (Platform.OS === "web") {
      Alert.alert("Web 暂不支持本地通知", "提醒功能请在手机 App 中使用。");
      return;
    }
    const result = await scheduleDailyReminders(reminders);
    setNotificationStatus(result.granted ? "已授权" : "未授权");
    setScheduledReminderCount(result.scheduled);
    Alert.alert(
      result.ok ? "提醒已开启" : "提醒未开启",
      result.ok
        ? `当前已启用 ${result.scheduled} 个提醒时段。`
        : "系统没有授予通知权限，请到手机系统设置里手动允许通知。"
    );
  };

  const addReminder = () => {
    const parsed = parseReminderInput(newReminderTime);
    if (!parsed) {
      Alert.alert("时间格式不正确", "请按 09:30 这样的格式输入。");
      return;
    }

    const exists = reminders.some((item) => item.hour === parsed.hour && item.minute === parsed.minute);
    if (exists) {
      Alert.alert("提醒已存在", "这个时间点已经添加过了。");
      return;
    }

    setReminders((prev) =>
      sortReminders([
        ...prev,
        {
          id: `${parsed.hour}-${parsed.minute}-${uid()}`,
          hour: parsed.hour,
          minute: parsed.minute,
          enabled: true,
        },
      ])
    );
    setNewReminderTime("09:00");
  };

  const toggleReminder = (reminderId: string, enabled: boolean) => {
    setReminders((prev) => prev.map((item) => (item.id === reminderId ? { ...item, enabled } : item)));
  };

  const deleteReminder = (reminderId: string) => {
    setReminders((prev) => prev.filter((item) => item.id !== reminderId));
  };

  const renderHome = () => (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Text style={styles.heroTitle}>背过</Text>
        <Text style={styles.heroText}>把不同学科材料拆成独立卡片册，每份材料都有自己的打卡日程和复习节奏。</Text>
      </View>

      <View style={styles.statsRow}>
        <StatCard value={String(materials.length)} label="材料数量" />
        <StatCard value={String(totalTasks)} label="总小节数" />
        <StatCard value={String(totalDone)} label="已熟练" />
      </View>

      <CardPanel title="材料总览" meta={`${materials.length} 份材料`}>
        <View style={styles.buttonRow}>
          <PrimaryButton label="新增材料" onPress={() => setScreen("import")} />
          <SecondaryButton label="提醒设置" onPress={() => setScreen("reminders")} />
        </View>
        <View style={{ marginTop: 12 }}>
          {materials.map((material) => {
            const done = material.cards.filter((card) => card.reviewState === "mature").length;
            const todayCount = getTodayQueue(material.cards).length;
            return (
              <Pressable key={material.id} style={styles.itemCard} onPress={() => openMaterial(material.id)}>
                <View style={styles.itemHead}>
                  <Text style={styles.itemTitle}>{material.name}</Text>
                  <Text style={styles.pill}>{`${done}/${material.cards.length}`}</Text>
                </View>
                <Text style={styles.itemMeta}>{`导入时间：${material.createdAt}`}</Text>
                <Text style={styles.itemSub}>{`今日待学 ${todayCount} 个小节 · 每日节奏 ${material.pace}`}</Text>
              </Pressable>
            );
          })}
        </View>
      </CardPanel>
    </ScrollView>
  );

  const renderImport = () => (
    <ScrollView contentContainerStyle={styles.content}>
      <CardPanel title="新增材料" meta="每次导入会新建一份卡片册">
        <Text style={styles.helpText}>
          默认材料已经内置为 mayuan.md。你可以保留它，也可以选择 Markdown/TXT 文件，或者直接粘贴内容，新建一份独立材料。
        </Text>
        <Text style={styles.importHint}>{importMessage}</Text>
        <View style={[styles.buttonRow, { marginBottom: 12 }]}>
          <PrimaryButton label="选择 Markdown/TXT 文件" onPress={importTextFile} />
        </View>

        <Text style={styles.fieldLabel}>材料名称</Text>
        <TextInput
          value={draftName}
          onChangeText={setDraftName}
          style={styles.input}
          placeholder="例如：马克思主义、机器学习"
          placeholderTextColor="#7b8797"
        />

        <Pressable style={styles.collapseButton} onPress={() => setPasteExpanded((prev) => !prev)}>
          <Text style={styles.collapseButtonText}>{pasteExpanded ? "收起粘贴内容" : "展开粘贴内容"}</Text>
        </Pressable>

        {pasteExpanded && (
          <TextInput
            multiline
            value={draftMarkdown}
            onChangeText={setDraftMarkdown}
            style={styles.textArea}
            placeholder="# 第一章 ..."
            placeholderTextColor="#7b8797"
          />
        )}
      </CardPanel>

      <CardPanel title="背诵速度" meta="按小节分配">
        <Text style={styles.helpText}>每天安排多少个小节，由你来定。生成后，这份材料会保留自己的独立日程。</Text>
        <TextInput
          value={pace}
          onChangeText={setPace}
          keyboardType="number-pad"
          style={styles.input}
          placeholder="4"
          placeholderTextColor="#7b8797"
        />
        <View style={[styles.buttonRow, { marginTop: 14 }]}>
          <PrimaryButton label="生成这份材料的计划" onPress={generatePlan} />
          <SecondaryButton label="返回首页" onPress={() => setScreen("home")} />
        </View>
      </CardPanel>
    </ScrollView>
  );

  const renderMaterial = () => {
    if (!selectedMaterial) return null;

    return (
      <ScrollView contentContainerStyle={styles.content}>
        <CardPanel title={selectedMaterial.name} meta={`${currentDayEntries.length} 天日程`}>
          <Text style={styles.helpText}>{`创建于 ${selectedMaterial.createdAt} · 当前每天安排 ${selectedMaterial.pace} 个小节`}</Text>
          <View style={styles.buttonRow}>
            <SecondaryButton label="返回材料列表" onPress={() => setScreen("home")} />
            <PrimaryButton label="开始今日打卡" onPress={startTodayStudy} disabled={!currentTodayQueue.length} />
          </View>
          <View style={styles.inlineEditor}>
            <TextInput
              value={materialPaceDraft}
              onChangeText={setMaterialPaceDraft}
              keyboardType="number-pad"
              style={[styles.input, styles.inlineInput]}
              placeholder="4"
              placeholderTextColor="#7b8797"
            />
            <Pressable style={styles.smallActionButton} onPress={updateMaterialPace}>
              <Text style={styles.smallActionButtonText}>调整速度</Text>
            </Pressable>
          </View>
          <Pressable style={styles.deleteButtonWide} onPress={deleteMaterial}>
            <Text style={styles.deleteButtonText}>删除这份日程</Text>
          </Pressable>
        </CardPanel>

        <CardPanel title="这份材料的打卡日程" meta={`${currentTodayQueue.length} 个今日任务`}>
          {currentDayEntries.map((entry) => (
            <Pressable
              key={entry.day}
              style={styles.itemCard}
              onPress={() => {
                setSelectedDay(entry.day);
                setScreen("day");
              }}
            >
              <View style={styles.itemHead}>
                <Text style={styles.itemTitle}>{entry.day}</Text>
                <Text style={styles.pill}>{entry.done >= entry.total ? "完成" : `${entry.done}/${entry.total}`}</Text>
              </View>
              <Text style={styles.itemMeta}>{entry.cards[0]?.source.label || "-正文"}</Text>
              <Text style={styles.itemSub}>{`共 ${entry.total} 个小节`}</Text>
            </Pressable>
          ))}
        </CardPanel>
      </ScrollView>
    );
  };

  const renderDay = () => (
    <ScrollView contentContainerStyle={styles.content}>
      <CardPanel title={selectedDay} meta={`${selectedDayCards.length} 个小节`}>
        <View style={styles.buttonRow}>
          <SecondaryButton label="返回材料日程" onPress={() => setScreen("material")} />
          <PrimaryButton label="开始当天内容" onPress={() => startDayStudy(selectedDay)} disabled={!selectedDayCards.length} />
        </View>

        {selectedDayCards.map((card) => (
          <View key={card.id} style={styles.itemCard}>
            <View style={styles.itemHead}>
              <Text style={styles.itemTitle}>{card.title}</Text>
              <Text style={styles.pill}>{getStateLabel(card)}</Text>
            </View>
            <Text style={styles.itemMeta}>{card.source.label}</Text>
            <Text style={styles.itemMeta}>{`${card.source.sectionPath} · ${card.source.paragraph}`}</Text>
            <Text style={styles.itemMeta}>{`下次复习：${card.due} · 间隔 ${Math.max(1, card.intervalDays)} 天 · 遗忘次数 ${card.lapses}`}</Text>
            <View style={styles.previewBlock}>
              <MarkdownBlock content={card.content} />
            </View>
          </View>
        ))}
      </CardPanel>
    </ScrollView>
  );

  const renderReadingActions = () => (
    <>
      <View style={styles.speedRow}>
        {[0.8, 1, 1.25, 1.5].map((rate) => (
          <Pressable
            key={rate}
            style={[styles.speedChip, speechRate === rate && styles.speedChipActive]}
            onPress={() => setSpeechRate(rate)}
          >
            <Text style={[styles.speedChipText, speechRate === rate && styles.speedChipTextActive]}>{`${rate}x`}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.buttonRow}>
        <PrimaryButton label={speechStatus === "speaking" ? "重新朗读" : "开始朗读"} onPress={speakCurrentCard} />
        <SecondaryButton label="跳过朗读" onPress={skipReading} />
      </View>
      <View style={[styles.buttonRow, { marginTop: 8 }]}>
        <PrimaryButton label="进入提问" onPress={beginQuestionFlow} disabled={questionLoading} />
        <SecondaryButton label="停止朗读" onPress={() => Speech.stop()} />
      </View>
    </>
  );

  const renderQuestionActions = () => (
    <>
      <Text style={styles.itemMeta}>{`问题 ${studyQuestionIndex + 1}/${Math.max(1, studyQuestions.length)}`}</Text>
      <View style={styles.buttonRow}>
        <PrimaryButton label={recognizing ? "正在收音..." : "开始口述回答"} onPress={startVoiceAnswer} disabled={recognizing} />
        <SecondaryButton label="停止收音" onPress={stopVoiceAnswer} />
      </View>
      <TextInput
        multiline
        value={answer}
        onChangeText={setAnswer}
        style={styles.answerBox}
        placeholder="这里会显示你的口述转写，也可以手动修改"
        placeholderTextColor="#7b8797"
      />
      {!!liveTranscript && <Text style={styles.liveText}>{`实时转写：${liveTranscript}`}</Text>}
      <View style={styles.buttonRow}>
        <SecondaryButton label="查看参考答案" onPress={() => setStudyPhase("answer")} />
        <PrimaryButton label={studyQuestionIndex + 1 >= studyQuestions.length ? "完成本卡提问" : "下一题"} onPress={nextQuestion} />
      </View>
    </>
  );

  const renderAnswerActions = () => (
    <>
      <View style={styles.answerReference}>
        <Text style={styles.answerTitle}>参考答案</Text>
        <MarkdownBlock content={activeQuestion?.answer || activeCard?.content || ""} />
      </View>
      <View style={styles.scoreRow}>
        <ScoreButton label="生疏" color="#d66755" onPress={() => scoreCard(1)} />
        <ScoreButton label="一般" color="#d6a228" onPress={() => scoreCard(3)} />
        <ScoreButton label="熟练" color="#1f9a5f" onPress={() => scoreCard(5)} />
      </View>
    </>
  );

  const renderStudy = () => (
    <ScrollView contentContainerStyle={styles.content}>
      <CardPanel
        title={studyPhase === "done" ? "今日打卡完成" : `学习 ${Math.min(studyIndex + 1, Math.max(1, studyQueue.length))}/${Math.max(1, studyQueue.length)}`}
        meta={activeCard?.source.label || selectedDay}
      >
        {studyPhase === "done" || !activeCard ? (
          <>
            <Text style={styles.doneText}>今天的内容已经完成了。你可以回到材料日程，或者再来一组继续巩固。</Text>
            <View style={styles.buttonRow}>
              <SecondaryButton label="返回材料日程" onPress={() => setScreen("material")} />
              <PrimaryButton label="再来一组" onPress={extraCard} />
            </View>
          </>
        ) : (
          <>
            <Text style={styles.itemMeta}>{`${activeCard.source.sectionPath} · ${activeCard.source.paragraph}`}</Text>
            <View style={styles.studyBlock}>
              {studyPhase === "question" ? (
                <Text style={styles.questionText}>{activeQuestion?.prompt || activeCard.question}</Text>
              ) : (
                <MarkdownBlock content={activeCard.content} />
              )}
            </View>

            {questionLoading && <Text style={styles.phaseText}>正在为这张卡生成多问题提问...</Text>}

            {studyPhase === "reading" && renderReadingActions()}
            {studyPhase === "question" && renderQuestionActions()}
            {studyPhase === "answer" && renderAnswerActions()}
          </>
        )}
      </CardPanel>
    </ScrollView>
  );

  const renderReminders = () => (
    <ScrollView contentContainerStyle={styles.content}>
      <CardPanel title="提醒时间设置" meta={`${enabledReminderCount} 个已启用`}>
        <Text style={styles.helpText}>
          这里可以新增、删除、开关提醒时段。保存后会自动重新安排每天的本地提醒，并在下次打开时保留。
        </Text>
        <View style={styles.statusPanel}>
          <Text style={styles.itemMeta}>{`权限状态：${notificationStatus}`}</Text>
          <Text style={styles.itemMeta}>{`当前已排程提醒：${scheduledReminderCount}`}</Text>
        </View>

        <View style={styles.reminderComposer}>
          <TextInput
            value={newReminderTime}
            onChangeText={setNewReminderTime}
            style={[styles.input, styles.reminderInput]}
            placeholder="09:00"
            placeholderTextColor="#7b8797"
          />
          <Pressable style={styles.smallActionButton} onPress={addReminder}>
            <Text style={styles.smallActionButtonText}>新增</Text>
          </Pressable>
        </View>

        <View style={{ marginTop: 12 }}>
          {sortReminders(reminders).map((item) => (
            <View key={item.id} style={styles.reminderRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemTitle}>{formatReminderTime(item.hour, item.minute)}</Text>
                <Text style={styles.itemMeta}>{item.enabled ? "已开启提醒" : "已关闭提醒"}</Text>
              </View>
              <Switch value={item.enabled} onValueChange={(value) => toggleReminder(item.id, value)} />
              <Pressable style={styles.deleteButton} onPress={() => deleteReminder(item.id)}>
                <Text style={styles.deleteButtonText}>删除</Text>
              </Pressable>
            </View>
          ))}
        </View>

        <View style={[styles.buttonRow, { marginTop: 14 }]}>
          <PrimaryButton label="重新申请提醒权限" onPress={enableNotifications} />
          <SecondaryButton label="返回首页" onPress={() => setScreen("home")} />
        </View>
      </CardPanel>
    </ScrollView>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <View>
          <Text style={styles.brand}>背过</Text>
          <Text style={styles.subline}>分材料管理的跨平台背诵 App</Text>
        </View>
      </View>

      {screen === "home" && renderHome()}
      {screen === "import" && renderImport()}
      {screen === "material" && renderMaterial()}
      {screen === "day" && renderDay()}
      {screen === "study" && renderStudy()}
      {screen === "reminders" && renderReminders()}

      <View style={styles.nav}>
        <NavButton label="首页" active={screen === "home"} onPress={() => setScreen("home")} />
        <NavButton label="新增" active={screen === "import"} onPress={() => setScreen("import")} />
        <NavButton label="提醒" active={screen === "reminders"} onPress={() => setScreen("reminders")} />
        <NavButton
          label="学习"
          active={screen === "study"}
          onPress={() => setScreen(studyQueue.length ? "study" : selectedMaterial ? "material" : "home")}
        />
      </View>
    </SafeAreaView>
  );
}

function CardPanel({
  title,
  meta,
  children,
}: {
  title: string;
  meta: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.panel}>
      <View style={styles.panelHead}>
        <Text style={styles.panelTitle}>{title}</Text>
        <Text style={styles.panelMeta}>{meta}</Text>
      </View>
      {children}
    </View>
  );
}

function StatCard({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function NavButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.navButton, active && styles.navButtonActive]}>
      <Text style={[styles.navText, active && styles.navTextActive]}>{label}</Text>
    </Pressable>
  );
}

function PrimaryButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[styles.primaryButton, disabled && styles.disabledButton]}>
      <Text style={styles.primaryButtonText}>{label}</Text>
    </Pressable>
  );
}

function SecondaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.secondaryButton}>
      <Text style={styles.secondaryButtonText}>{label}</Text>
    </Pressable>
  );
}

function ScoreButton({ label, color, onPress }: { label: string; color: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.scoreButton, { backgroundColor: color }]}>
      <Text style={styles.scoreButtonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#f5f7fb",
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  brand: {
    fontSize: 24,
    fontWeight: "800",
    color: "#142233",
  },
  subline: {
    marginTop: 4,
    color: "#627287",
    fontSize: 13,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 120,
  },
  hero: {
    padding: 18,
    borderRadius: 16,
    backgroundColor: "#0f8f8a",
    marginBottom: 14,
  },
  heroTitle: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "800",
  },
  heroText: {
    color: "#daf4f2",
    marginTop: 8,
    lineHeight: 22,
  },
  statsRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: "#ffffff",
    padding: 14,
    borderRadius: 14,
  },
  statValue: {
    fontSize: 22,
    fontWeight: "800",
    color: "#132031",
  },
  statLabel: {
    marginTop: 6,
    color: "#627287",
    fontSize: 12,
  },
  panel: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
  },
  panelHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  panelTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#142233",
    flex: 1,
    paddingRight: 12,
  },
  panelMeta: {
    color: "#627287",
    fontSize: 12,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
  },
  primaryButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: "#0f8f8a",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontWeight: "700",
    textAlign: "center",
  },
  secondaryButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: "#edf2f7",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  secondaryButtonText: {
    color: "#203042",
    fontWeight: "700",
    textAlign: "center",
  },
  disabledButton: {
    opacity: 0.45,
  },
  itemCard: {
    backgroundColor: "#f8fbff",
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
  },
  itemHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  itemTitle: {
    flex: 1,
    color: "#132031",
    fontSize: 15,
    fontWeight: "700",
    paddingRight: 10,
  },
  itemMeta: {
    color: "#5d6b7c",
    fontSize: 12,
    marginBottom: 4,
  },
  itemSub: {
    color: "#445366",
    fontSize: 13,
  },
  pill: {
    color: "#0f5f5a",
    backgroundColor: "#dff5f3",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: "hidden",
    fontSize: 12,
    fontWeight: "700",
  },
  helpText: {
    color: "#5d6b7c",
    marginBottom: 12,
    lineHeight: 20,
  },
  importHint: {
    color: "#0f5f5a",
    marginBottom: 10,
    lineHeight: 20,
    fontWeight: "600",
  },
  fieldLabel: {
    color: "#203042",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 8,
  },
  collapseButton: {
    minHeight: 42,
    borderRadius: 12,
    backgroundColor: "#edf2f7",
    justifyContent: "center",
    alignItems: "center",
    marginVertical: 12,
    paddingHorizontal: 12,
  },
  collapseButtonText: {
    color: "#203042",
    fontWeight: "700",
  },
  textArea: {
    minHeight: 260,
    borderRadius: 14,
    backgroundColor: "#f7fafc",
    padding: 14,
    textAlignVertical: "top",
    color: "#132031",
    lineHeight: 22,
  },
  input: {
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: "#f7fafc",
    paddingHorizontal: 12,
    color: "#132031",
  },
  inlineEditor: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
    alignItems: "center",
  },
  inlineInput: {
    flex: 1,
  },
  statusPanel: {
    backgroundColor: "#f8fbff",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  reminderComposer: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  reminderInput: {
    flex: 1,
  },
  smallActionButton: {
    minWidth: 88,
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: "#0f8f8a",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  smallActionButtonText: {
    color: "#ffffff",
    fontWeight: "700",
  },
  reminderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#f8fbff",
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
  },
  deleteButton: {
    minHeight: 38,
    borderRadius: 10,
    backgroundColor: "#fceceb",
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  deleteButtonWide: {
    minHeight: 42,
    marginTop: 12,
    borderRadius: 12,
    backgroundColor: "#fceceb",
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  deleteButtonText: {
    color: "#c14d41",
    fontWeight: "700",
  },
  previewBlock: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
  },
  markdownBlock: {
    gap: 6,
  },
  markdownLine: {
    color: "#132031",
    lineHeight: 22,
  },
  strong: {
    fontWeight: "800",
    color: "#0d2235",
  },
  h1: {
    fontSize: 20,
    fontWeight: "800",
    color: "#122234",
  },
  h2: {
    fontSize: 17,
    fontWeight: "800",
    color: "#122234",
  },
  h3: {
    fontSize: 15,
    fontWeight: "700",
    color: "#122234",
  },
  h4: {
    fontSize: 14,
    fontWeight: "700",
    color: "#122234",
  },
  studyBlock: {
    backgroundColor: "#f8fbff",
    borderRadius: 14,
    padding: 14,
    marginTop: 8,
  },
  questionText: {
    fontSize: 18,
    lineHeight: 28,
    color: "#122234",
    fontWeight: "700",
  },
  phaseText: {
    marginTop: 12,
    color: "#627287",
    textAlign: "center",
  },
  answerBox: {
    minHeight: 120,
    marginTop: 12,
    borderRadius: 14,
    backgroundColor: "#f7fafc",
    padding: 14,
    textAlignVertical: "top",
    color: "#132031",
  },
  liveText: {
    marginTop: 10,
    color: "#0f5f5a",
    lineHeight: 20,
    fontSize: 13,
  },
  scoreRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },
  scoreButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  scoreButtonText: {
    color: "#fff",
    fontWeight: "800",
  },
  doneText: {
    color: "#445366",
    lineHeight: 22,
    marginBottom: 12,
  },
  speedRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
    flexWrap: "wrap",
  },
  speedChip: {
    minWidth: 60,
    minHeight: 36,
    borderRadius: 999,
    backgroundColor: "#edf2f7",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  speedChipActive: {
    backgroundColor: "#dff5f3",
  },
  speedChipText: {
    color: "#445366",
    fontWeight: "700",
  },
  speedChipTextActive: {
    color: "#0f5f5a",
  },
  answerReference: {
    marginTop: 12,
    borderRadius: 14,
    backgroundColor: "#f8fbff",
    padding: 14,
  },
  answerTitle: {
    color: "#142233",
    fontWeight: "800",
    marginBottom: 8,
  },
  nav: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
    flexDirection: "row",
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.96)",
    padding: 8,
    borderRadius: 18,
  },
  navButton: {
    flex: 1,
    minHeight: 46,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 12,
  },
  navButtonActive: {
    backgroundColor: "#dff5f3",
  },
  navText: {
    color: "#627287",
    fontWeight: "600",
  },
  navTextActive: {
    color: "#0f5f5a",
    fontWeight: "800",
  },
});
