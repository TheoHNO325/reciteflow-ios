import { StatusBar } from "expo-status-bar";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

type Screen = "home" | "import" | "day" | "study";

type SourceInfo = {
  chapter: string;
  sectionPath: string;
  paragraph: string;
  label: string;
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
  status: "scheduled" | "done";
};

type DayEntry = {
  day: string;
  cards: Card[];
  done: number;
  total: number;
};

const demoMarkdown = `# 第三章 实践与认识
## 第一节 实践的本质
实践是人类能动地改造世界的客观物质活动。
**实践的本质特征有：**
1. 客观实在性
2. 自觉能动性
3. 社会历史性

## 第二节 实践与认识的关系
实践决定认识，认识对实践具有反作用。

# 第四章 真理与价值
## 第一节 真理的特征
真理具有客观性、具体性和条件性。

## 第二节 真理的检验标准
实践是检验真理的唯一标准。`;

const uid = () => Math.random().toString(36).slice(2, 10);

const todayISO = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

const normalizeText = (text: string) =>
  text
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

const inferQuestion = (content: string, title: string) => {
  if (/本质特征|基本特征|主要特征|特点/.test(content)) {
    return `${title}的本质特征或主要特点有哪些？`;
  }
  if (/定义|概念|含义|是指/.test(content)) {
    return `${title}是什么？请说明其核心含义。`;
  }
  if (/原因|为什么/.test(content)) {
    return `${title}的原因是什么？`;
  }
  if (/意义|影响|作用/.test(content)) {
    return `${title}有什么意义、影响或作用？`;
  }
  if (/措施|方法|路径|要求|必须|应当/.test(content)) {
    return `围绕${title}，应该采取哪些措施或遵循哪些要求？`;
  }
  if (/包括|分为|有[:：1-9一二三四五六七八九十]/.test(content)) {
    return `${title}包括哪些方面？`;
  }
  return `如果你是命题人，会如何考查“${title}”这一小节？`;
};

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
      status: "scheduled" as const,
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
      done: dayCards.filter((card) => card.status === "done").length,
      total: dayCards.length,
    }))
    .sort((a, b) => a.day.localeCompare(b.day));
};

const getTodayQueue = (cards: Card[]) => {
  const today = todayISO();
  return cards
    .filter((card) => card.introducedOn === today || (card.due <= today && card.status !== "done"))
    .sort((a, b) => a.order - b.order);
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
    } else if (part) {
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
        const ol = line.match(/^\d+[.)]\s+(.+)$/);
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
              {`${index + 1}. `}
              {inlineMarkdown(ol[1])}
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

export default function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const [markdown, setMarkdown] = useState(demoMarkdown);
  const [pace, setPace] = useState("4");
  const [cards, setCards] = useState<Card[]>(() => parseMarkdownToCards(demoMarkdown, 4));
  const [selectedDay, setSelectedDay] = useState(todayISO());
  const [studyQueue, setStudyQueue] = useState<Card[]>([]);
  const [studyIndex, setStudyIndex] = useState(0);
  const [studyPhase, setStudyPhase] = useState<"reading" | "question" | "answer" | "done">("reading");
  const [secondsLeft, setSecondsLeft] = useState(10);
  const [answer, setAnswer] = useState("");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const dayEntries = useMemo(() => groupByDay(cards), [cards]);
  const todayQueue = useMemo(() => getTodayQueue(cards), [cards]);
  const activeCard = studyQueue[studyIndex] || null;
  const selectedDayCards = useMemo(
    () => cards.filter((card) => card.introducedOn === selectedDay).sort((a, b) => a.order - b.order),
    [cards, selectedDay]
  );

  useEffect(() => {
    if (studyPhase !== "reading" || !activeCard) return;
    setSecondsLeft(10);
    timerRef.current && clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          setStudyPhase("question");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      timerRef.current && clearInterval(timerRef.current);
    };
  }, [studyPhase, activeCard?.id]);

  const generatePlan = () => {
    const parsed = parseMarkdownToCards(markdown, Number(pace) || 4);
    setCards(parsed);
    setSelectedDay(parsed[0]?.introducedOn || todayISO());
    setScreen("home");
  };

  const startTodayStudy = () => {
    if (!todayQueue.length) return;
    setStudyQueue(todayQueue);
    setStudyIndex(0);
    setStudyPhase("reading");
    setAnswer("");
    setScreen("study");
  };

  const startDayStudy = (day: string) => {
    const queue = cards.filter((card) => card.introducedOn === day).sort((a, b) => a.order - b.order);
    if (!queue.length) return;
    setSelectedDay(day);
    setStudyQueue(queue);
    setStudyIndex(0);
    setStudyPhase("reading");
    setAnswer("");
    setScreen("study");
  };

  const scoreCard = (score: number) => {
    if (!activeCard) return;
    const today = todayISO();
    const nextCards = cards.map((card) => {
      if (card.id !== activeCard.id) return card;
      const reviewed = card.reviewed + 1;
      const done = score >= 5 && reviewed >= 2;
      return {
        ...card,
        reviewed,
        correctStreak: score >= 4 ? card.correctStreak + 1 : 0,
        due: addDays(today, score >= 4 ? 2 : 1),
        status: done ? "done" : card.status,
      };
    });
    setCards(nextCards);

    if (studyIndex + 1 >= studyQueue.length) {
      setStudyPhase("done");
      setStudyQueue([]);
      setStudyIndex(0);
      return;
    }

    setStudyIndex((prev) => prev + 1);
    setStudyPhase("reading");
    setAnswer("");
  };

  const extraCard = () => {
    const queue = cards.filter((card) => card.status !== "done").sort((a, b) => a.reviewed - b.reviewed || a.order - b.order);
    if (!queue.length) return;
    setStudyQueue([queue[0]]);
    setStudyIndex(0);
    setStudyPhase("reading");
    setAnswer("");
  };

  const renderHome = () => (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Text style={styles.heroTitle}>ReciteFlow iOS</Text>
        <Text style={styles.heroText}>把 Markdown 学习材料变成每天能打卡的记忆任务。</Text>
      </View>

      <View style={styles.statsRow}>
        <StatCard value={String(todayQueue.length)} label="今日任务" />
        <StatCard value={String(dayEntries.length)} label="打卡天数" />
        <StatCard value={String(cards.filter((card) => card.status === "done").length)} label="已完成" />
      </View>

      <CardPanel title="今日进度" meta={`${todayISO()}`}>
        <View style={styles.buttonRow}>
          <PrimaryButton label="开始今日打卡" onPress={startTodayStudy} disabled={!todayQueue.length} />
          <SecondaryButton label="导入材料" onPress={() => setScreen("import")} />
        </View>
      </CardPanel>

      <CardPanel title="打卡日程" meta={`${dayEntries.length} 天`}>
        {dayEntries.map((entry) => (
          <Pressable key={entry.day} style={styles.itemCard} onPress={() => { setSelectedDay(entry.day); setScreen("day"); }}>
            <View style={styles.itemHead}>
              <Text style={styles.itemTitle}>{entry.day}</Text>
              <Text style={styles.pill}>{entry.done >= entry.total ? "完成" : `${entry.done}/${entry.total}`}</Text>
            </View>
            <Text style={styles.itemMeta}>{entry.cards[0]?.source.label || "-正文"}</Text>
            <Text style={styles.itemSub}>{`共 ${entry.total} 项内容`}</Text>
          </Pressable>
        ))}
      </CardPanel>
    </ScrollView>
  );

  const renderImport = () => (
    <ScrollView contentContainerStyle={styles.content}>
      <CardPanel title="Markdown 导入" meta="iOS MVP">
        <Text style={styles.helpText}>第一版先支持直接粘贴 Markdown。后面我们再接文件导入、PDF 和 Word 解析。</Text>
        <TextInput
          multiline
          value={markdown}
          onChangeText={setMarkdown}
          style={styles.textArea}
          placeholder="# 第三章 ..."
          placeholderTextColor="#7b8797"
        />
      </CardPanel>

      <CardPanel title="背诵速度" meta="每日小节">
        <TextInput
          value={pace}
          onChangeText={setPace}
          keyboardType="number-pad"
          style={styles.input}
          placeholder="4"
          placeholderTextColor="#7b8797"
        />
        <View style={[styles.buttonRow, { marginTop: 14 }]}>
          <PrimaryButton label="生成计划" onPress={generatePlan} />
          <SecondaryButton label="返回首页" onPress={() => setScreen("home")} />
        </View>
      </CardPanel>
    </ScrollView>
  );

  const renderDay = () => (
    <ScrollView contentContainerStyle={styles.content}>
      <CardPanel title={selectedDay} meta={`${selectedDayCards.length} 项`}>
        <View style={styles.buttonRow}>
          <SecondaryButton label="返回日程" onPress={() => setScreen("home")} />
          <PrimaryButton label="开始当天内容" onPress={() => startDayStudy(selectedDay)} disabled={!selectedDayCards.length} />
        </View>
        {selectedDayCards.map((card) => (
          <View key={card.id} style={styles.itemCard}>
            <View style={styles.itemHead}>
              <Text style={styles.itemTitle}>{card.title}</Text>
              <Text style={styles.pill}>{card.status === "done" ? "完成" : card.reviewed ? "复习中" : "待开始"}</Text>
            </View>
            <Text style={styles.itemMeta}>{card.source.label}</Text>
            <View style={styles.previewBlock}>
              <MarkdownBlock content={card.content} />
            </View>
          </View>
        ))}
      </CardPanel>
    </ScrollView>
  );

  const renderStudy = () => (
    <ScrollView contentContainerStyle={styles.content}>
      <CardPanel
        title={studyPhase === "done" ? "今日打卡完成" : `学习 ${Math.min(studyIndex + 1, Math.max(1, studyQueue.length))}/${Math.max(1, studyQueue.length)}`}
        meta={activeCard?.source.label || selectedDay}
      >
        {studyPhase === "done" || !activeCard ? (
          <>
            <Text style={styles.doneText}>今天的内容已经完成了。你可以回到首页，或者再来一组继续巩固。</Text>
            <View style={styles.buttonRow}>
              <SecondaryButton label="返回首页" onPress={() => setScreen("home")} />
              <PrimaryButton label="再来一组" onPress={extraCard} />
            </View>
          </>
        ) : (
          <>
            <View style={styles.studyBlock}>
              {studyPhase === "question" ? (
                <Text style={styles.questionText}>{activeCard.question}</Text>
              ) : (
                <MarkdownBlock content={activeCard.content} />
              )}
            </View>

            {studyPhase === "reading" && <Text style={styles.phaseText}>{`${secondsLeft}s 后进入提问`}</Text>}

            {studyPhase !== "reading" && (
              <TextInput
                multiline
                value={answer}
                onChangeText={setAnswer}
                style={styles.answerBox}
                placeholder="在这里默写你的答案"
                placeholderTextColor="#7b8797"
              />
            )}

            {studyPhase === "question" && (
              <View style={styles.buttonRow}>
                <SecondaryButton label="返回日程" onPress={() => setScreen("day")} />
                <PrimaryButton label="显示答案" onPress={() => setStudyPhase("answer")} />
              </View>
            )}

            {studyPhase === "answer" && (
              <View style={styles.scoreRow}>
                <ScoreButton label="生疏" color="#d66755" onPress={() => scoreCard(1)} />
                <ScoreButton label="一般" color="#d6a228" onPress={() => scoreCard(3)} />
                <ScoreButton label="熟练" color="#1f9a5f" onPress={() => scoreCard(5)} />
              </View>
            )}
          </>
        )}
      </CardPanel>
    </ScrollView>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <View>
          <Text style={styles.brand}>ReciteFlow</Text>
          <Text style={styles.subline}>iOS MVP</Text>
        </View>
      </View>

      {screen === "home" && renderHome()}
      {screen === "import" && renderImport()}
      {screen === "day" && renderDay()}
      {screen === "study" && renderStudy()}

      <View style={styles.nav}>
        <NavButton label="首页" active={screen === "home"} onPress={() => setScreen("home")} />
        <NavButton label="导入" active={screen === "import"} onPress={() => setScreen("import")} />
        <NavButton label="日程" active={screen === "day"} onPress={() => setScreen("day")} />
        <NavButton label="学习" active={screen === "study"} onPress={() => setScreen("study")} />
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
  },
  panelMeta: {
    color: "#627287",
    fontSize: 12,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 8,
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
