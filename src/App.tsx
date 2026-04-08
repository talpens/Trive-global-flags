import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, RotateCcw, Globe, MapPin, Flag, ChevronRight, CheckCircle2, XCircle, AlertTriangle, Users, Brain, LogIn, LogOut, Zap, Flame, Volume2, VolumeX } from 'lucide-react';
import { cn } from './lib/utils';
import { GameStage, GameState, Question, UserStats } from './types';
import { generateQuestions } from './services/gameService';
import { auth, db } from './firebase';
import { GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut, User } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, collection, query, orderBy, limit, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';

const BG_MUSIC_URL = 'https://cdn.pixabay.com/audio/2022/01/18/audio_d0a13f69d2.mp3'; // Industrial/Cyberpunk

const RetroBackground = () => (
  <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
    {/* Rivets */}
    <div className="rivet top-4 left-4" />
    <div className="rivet top-4 right-4" />
    <div className="rivet bottom-4 left-4" />
    <div className="rivet bottom-4 right-4" />
    <div className="rivet top-1/2 left-4" />
    <div className="rivet top-1/2 right-4" />
    
    {/* Panel Lines */}
    <div className="absolute top-0 left-1/4 w-px h-full bg-white/5" />
    <div className="absolute top-0 right-1/4 w-px h-full bg-white/5" />
    <div className="absolute top-1/3 left-0 w-full h-px bg-white/5" />
    <div className="absolute bottom-1/3 left-0 w-full h-px bg-white/5" />
    
    {/* Circuit Patterns */}
    <div className="absolute top-20 left-20 w-40 h-40 border border-white/5 rounded-full opacity-20" />
    <div className="absolute bottom-20 right-20 w-60 h-60 border border-white/5 rounded-full opacity-10" />
  </div>
);

const Bubble = ({ text, className }: { text: string, className: string }) => (
  <motion.div 
    initial={{ opacity: 0, scale: 0 }}
    animate={{ opacity: 1, scale: 1 }}
    transition={{ delay: Math.random() * 2 }}
    className={cn("absolute bg-white border-2 border-black px-2 py-1 text-black font-black text-[10px] shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] z-0", className)}
  >
    {text}
    <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-white border-r-2 border-b-2 border-black rotate-45" />
  </motion.div>
);

const GameLogo = () => (
  <div className="relative mb-12 flex flex-col items-center">
    <div className="relative">
      <motion.div 
        animate={{ y: [0, -10, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        className="relative z-10"
      >
        <div className="absolute inset-0 bg-blue-500/20 blur-3xl rounded-full animate-pulse" />
        <img 
          src="https://storage.googleapis.com/static.antigravity.dev/gen-lang-client-0991184858/attachments/7891820a-820a-420a-820a-7891820a820a.png"
          alt="Game Logo"
          className="w-64 h-64 relative z-10 object-contain drop-shadow-[0_0_15px_rgba(96,165,250,0.5)]"
          referrerPolicy="no-referrer"
        />
      </motion.div>
    </div>
    
    {/* Title Box */}
    <div className="mt-[-30px] relative z-30 w-full max-w-md">
      <div className="bg-[#0055ff] border-4 border-black px-8 py-6 shadow-[10px_10px_0px_0px_rgba(0,0,0,1)] relative">
        <div className="absolute top-1 left-1 right-1 h-1 bg-white/20" />
        <h1 className="text-4xl sm:text-5xl font-black text-white tracking-tighter drop-shadow-[3px_3px_0px_rgba(0,0,0,1)] text-center">
          טריוויה <span className="text-yellow-400">גלובלית ומקומית</span>
        </h1>
        <div className="mt-2 text-center">
          <span className="bg-black text-white px-4 py-1 text-lg font-bold italic uppercase tracking-tight">
            מדינות, ערים וסמלים
          </span>
        </div>
      </div>
    </div>

    {/* Floating Bubbles */}
    <Bubble text="MEM" className="top-0 -left-20" />
    <Bubble text="מ" className="top-20 -right-20" />
    <Bubble text="MEM" className="bottom-0 -left-10" />
    <Bubble text="מ" className="top-40 -left-32" />
    <Bubble text="MEM" className="bottom-20 -right-16" />
    <Bubble text="מ" className="top-10 right-0" />
  </div>
);

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  
  const [gameState, setGameState] = useState<GameState>({
    stage: GameStage.COUNTRIES,
    currentQuestionIndex: 0,
    score: 0,
    totalQuestions: 0,
    isFinished: false,
    isAllOrNothing: false,
    mistakesThisSession: [],
  });

  const [questions, setQuestions] = useState<Question[]>([]);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);

  // Audio Setup
  useEffect(() => {
    const audio = new Audio(BG_MUSIC_URL);
    audio.loop = true;
    audio.volume = 0.3;
    audioRef.current = audio;

    return () => {
      audio.pause();
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.muted = isMuted;
    }
  }, [isMuted]);

  const toggleMusic = () => {
    if (audioRef.current) {
      if (audioRef.current.paused) {
        audioRef.current.play().catch(e => console.log("Autoplay blocked", e));
      }
      setIsMuted(!isMuted);
    }
  };

  const playMusic = () => {
    if (audioRef.current && audioRef.current.paused && !isMuted) {
      audioRef.current.play().catch(e => console.log("Autoplay blocked", e));
    }
  };

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const userDoc = await getDoc(doc(db, 'users', u.uid));
        if (userDoc.exists()) {
          setUserStats(userDoc.data() as UserStats);
        } else {
          const newStats: UserStats = {
            uid: u.uid,
            displayName: u.displayName || 'שחקן אנונימי',
            highScore: 0,
            mistakes: {},
            completedStages: [],
          };
          await setDoc(doc(db, 'users', u.uid), newStats);
          setUserStats(newStats);
        }
      } else {
        setUserStats(null);
      }
    });
    return unsubscribe;
  }, []);

  const login = async () => {
    playMusic();
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error('Login failed', error);
    }
  };

  const fetchLeaderboard = async () => {
    const q = query(collection(db, 'leaderboard'), orderBy('score', 'desc'), limit(10));
    const querySnapshot = await getDocs(q);
    const entries = querySnapshot.docs.map(doc => doc.data());
    setLeaderboard(entries);
    setShowLeaderboard(true);
  };

  const startStage = useCallback((stage: GameStage, options: { localCountry?: string, isAllOrNothing?: boolean, targetCountryCodes?: string[] } = {}) => {
    playMusic();
    const newQuestions = generateQuestions(stage, options.localCountry, options.targetCountryCodes);
    setQuestions(newQuestions);
    setGameState({
      stage,
      currentQuestionIndex: 0,
      score: 0,
      totalQuestions: newQuestions.length,
      isFinished: false,
      localCountry: options.localCountry,
      isAllOrNothing: options.isAllOrNothing || false,
      mistakesThisSession: [],
    });
    setGameStarted(true);
    setShowFeedback(false);
    setSelectedOption(null);
  }, []);

  const handleAnswer = async (option: string) => {
    if (selectedOption) return;

    const currentQuestion = questions[gameState.currentQuestionIndex];
    const correct = option === currentQuestion.correctAnswer;
    
    setSelectedOption(option);
    setIsCorrect(correct);
    setShowFeedback(true);

    if (correct) {
      setGameState(prev => ({ ...prev, score: prev.score + 1 }));
    } else {
      if (currentQuestion.countryCode) {
        setGameState(prev => ({ 
          ...prev, 
          mistakesThisSession: [...prev.mistakesThisSession, currentQuestion.countryCode!] 
        }));
      }

      if (gameState.isAllOrNothing) {
        setTimeout(() => {
          alert('טעות במצב הכל או כלום! חוזרים להתחלה...');
          startStage(gameState.stage, { 
            localCountry: gameState.localCountry, 
            isAllOrNothing: true 
          });
        }, 1500);
        return;
      }
    }

    setTimeout(async () => {
      if (gameState.currentQuestionIndex + 1 < questions.length) {
        setGameState(prev => ({ ...prev, currentQuestionIndex: prev.currentQuestionIndex + 1 }));
        setSelectedOption(null);
        setIsCorrect(null);
        setShowFeedback(false);
      } else {
        const finalScore = correct ? gameState.score + 1 : gameState.score;
        setGameState(prev => ({ ...prev, isFinished: true, score: finalScore }));
        
        if (user) {
          const newMistakes = { ...(userStats?.mistakes || {}) };
          gameState.mistakesThisSession.forEach(code => {
            newMistakes[code] = (newMistakes[code] || 0) + 1;
          });
          if (!correct && currentQuestion.countryCode) {
            newMistakes[currentQuestion.countryCode] = (newMistakes[currentQuestion.countryCode] || 0) + 1;
          }

          const currentHighScore = Number(userStats?.highScore || 0);
          const isNewHighScore = finalScore > currentHighScore;
          
          await updateDoc(doc(db, 'users', user.uid), {
            highScore: isNewHighScore ? finalScore : currentHighScore,
            mistakes: newMistakes,
          });

          if (isNewHighScore) {
            await addDoc(collection(db, 'leaderboard'), {
              uid: user.uid,
              displayName: user.displayName,
              score: finalScore,
              stage: gameState.stage,
              timestamp: serverTimestamp(),
            });
          }
          
          const updatedDoc = await getDoc(doc(db, 'users', user.uid));
          setUserStats(updatedDoc.data() as UserStats);
        }
      }
    }, 1500);
  };

  const resetGame = () => {
    setGameStarted(false);
    setShowLeaderboard(false);
    setGameState(prev => ({
      ...prev,
      currentQuestionIndex: 0,
      score: 0,
      isFinished: false,
    }));
  };

  if (!gameStarted) {
    const topMistakes = userStats?.mistakes 
      ? Object.entries(userStats.mistakes)
          .sort((a, b) => (b[1] as number) - (a[1] as number))
          .slice(0, 10)
          .map(([code]) => code)
      : [];

    return (
      <div className="min-h-screen bg-[#1a1a1a] text-white flex flex-col items-center justify-center p-6 font-sans relative" dir="rtl">
        <RetroBackground />
        
        <div className="absolute top-6 left-6 z-50 flex gap-4">
          <button onClick={toggleMusic} className="pixel-panel p-2 hover:bg-white/10 transition-colors">
            {isMuted ? <VolumeX className="w-6 h-6 text-red-500" /> : <Volume2 className="w-6 h-6 text-blue-400" />}
          </button>

          {user ? (
            <div className="flex items-center gap-4 bg-black/50 p-2 pr-4 rounded-none border-2 border-white/10">
              <span className="text-sm font-black italic">{user.displayName}</span>
              <img src={user.photoURL || ''} className="w-8 h-8 rounded-none border border-white/20" />
              <button onClick={() => signOut(auth)} className="p-2 hover:text-red-500 transition-colors">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button onClick={login} className="pixel-button-red !bg-blue-600 !py-2 !px-4">
              <div className="flex items-center gap-2">
                <LogIn className="w-4 h-4" /> התחבר
              </div>
            </button>
          )}
        </div>

        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center max-w-2xl z-10 flex flex-col items-center"
        >
          <GameLogo />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 w-full mt-8">
            <button 
              onClick={() => startStage(GameStage.COUNTRIES)}
              className="pixel-button-red !bg-white !text-black hover:!bg-yellow-400 transition-all"
            >
              <div className="flex items-center justify-center gap-3">
                <Flag className="w-6 h-6" />
                <span className="text-2xl">התחל משחק</span>
              </div>
            </button>

            <button 
              onClick={() => startStage(GameStage.COUNTRIES, { isAllOrNothing: true })}
              className="pixel-button-red hover:!bg-black transition-all"
            >
              <div className="flex items-center justify-center gap-3">
                <AlertTriangle className="w-6 h-6" />
                <span className="text-2xl">הכל או כלום</span>
              </div>
            </button>

            <button 
              onClick={() => startStage(GameStage.LOCAL_MODE, { localCountry: 'ישראל' })}
              className="pixel-button-red !bg-blue-600 hover:!bg-blue-700 transition-all"
            >
              <div className="flex items-center justify-center gap-3">
                <MapPin className="w-6 h-6" />
                <span className="text-2xl">הגרסה הישראלית</span>
              </div>
            </button>

            <button 
              disabled={topMistakes.length === 0}
              onClick={() => startStage(GameStage.KNOWLEDGE_GAP, { targetCountryCodes: topMistakes })}
              className="pixel-button-red !bg-zinc-800 !text-white hover:!bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <div className="flex items-center justify-center gap-3">
                <Brain className="w-6 h-6" />
                <span className="text-2xl">מה נשאר לי?</span>
              </div>
            </button>
          </div>

          <div className="mt-12">
            <button onClick={fetchLeaderboard} className="flex items-center gap-2 mx-auto text-gray-500 hover:text-white transition-colors uppercase font-mono text-xs tracking-widest">
              <Users className="w-4 h-4" /> טבלת מובילים
            </button>
          </div>
        </motion.div>

        {/* Leaderboard Modal */}
        <AnimatePresence>
          {showLeaderboard && (
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/90 z-[100] flex items-center justify-center p-6"
            >
              <div className="pixel-panel p-8 max-w-md w-full">
                <h2 className="text-3xl font-black mb-6 italic uppercase text-yellow-400">טבלת מובילים</h2>
                <div className="space-y-4 mb-8">
                  {leaderboard.map((entry, i) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-black/30 border-r-4 border-blue-500">
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-gray-500">#{i+1}</span>
                        <span className="font-bold">{entry.displayName}</span>
                      </div>
                      <span className="text-yellow-400 font-black">{entry.score}</span>
                    </div>
                  ))}
                </div>
                <button onClick={() => setShowLeaderboard(false)} className="pixel-button-red w-full">
                  סגור
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  if (gameState.isFinished) {
    const successRate = (gameState.score / gameState.totalQuestions) * 100;
    const isPerfect = successRate === 100;

    return (
      <div className="min-h-screen bg-[#1a1a1a] text-white flex flex-col items-center justify-center p-6 font-sans relative" dir="rtl">
        <RetroBackground />
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-center max-w-xl w-full pixel-panel p-12 z-10"
        >
          <Trophy className={cn("w-24 h-24 mx-auto mb-6", isPerfect ? "text-yellow-400" : "text-gray-500")} />
          <h2 className="text-5xl font-black mb-2 uppercase italic text-white">
            {isPerfect ? "שלמות מוחלטת!" : "סוף השלב"}
          </h2>
          <p className="text-gray-400 mb-8 text-lg">
            צדקת ב-<span className="text-yellow-400 font-black">{gameState.score}</span> מתוך <span className="text-white font-black">{gameState.totalQuestions}</span> שאלות.
          </p>

          <div className="w-full bg-black h-6 mb-12 border-2 border-[#444] p-1">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${successRate}%` }}
              className="h-full bg-blue-600 shadow-[0_0_10px_rgba(37,99,235,0.5)]"
            />
          </div>

          <div className="flex flex-col gap-6">
            {isPerfect && gameState.stage < GameStage.LOCAL_MODE && (
              <button 
                onClick={() => startStage(gameState.stage + 1, { localCountry: gameState.localCountry })}
                className="pixel-button-red !bg-green-600"
              >
                עבור לשלב הבא <ChevronRight className="w-5 h-5" />
              </button>
            )}
            
            {!isPerfect && (
              <div className="bg-red-600/10 border-2 border-red-600 p-4 mb-4 flex items-center gap-3 text-red-500 text-right">
                <AlertTriangle className="w-6 h-6 shrink-0" />
                <p className="text-sm font-black italic uppercase">
                  כדי לעבור לשלב הבא עליך להשיג 100% הצלחה. נסה שוב!
                </p>
              </div>
            )}

            <button 
              onClick={() => startStage(gameState.stage, { localCountry: gameState.localCountry, isAllOrNothing: gameState.isAllOrNothing })}
              className="pixel-button-red !bg-white !text-black"
            >
              נסה שוב <RotateCcw className="w-5 h-5" />
            </button>

            <button 
              onClick={resetGame}
              className="text-gray-500 hover:text-white transition-colors text-sm font-mono uppercase tracking-widest mt-4"
            >
              חזרה לתפריט הראשי
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  const currentQuestion = questions[gameState.currentQuestionIndex];

  return (
    <div className="min-h-screen bg-[#1a1a1a] text-white flex flex-col font-sans relative" dir="rtl">
      <RetroBackground />
      
      {/* Header */}
      <header className="p-6 border-b-4 border-black flex items-center justify-between bg-[#2a2a2a] sticky top-0 z-50 shadow-lg">
        <div className="flex items-center gap-4">
          <div className="bg-[#ff0000] border-2 border-black text-white px-3 py-1 font-black italic text-sm shadow-[2px_2px_0px_rgba(0,0,0,1)]">
            {gameState.isAllOrNothing ? "HELL MODE" : `STAGE 0${gameState.stage}`}
          </div>
          <h3 className="font-mono text-xs text-gray-400 uppercase tracking-widest hidden sm:block">
            {gameState.stage === GameStage.COUNTRIES ? "זיהוי דגלים" : 
             gameState.stage === GameStage.CAPITALS ? "ערי בירה" :
             gameState.stage === GameStage.SUBURBS ? "פרוורים עולמיים" : 
             gameState.stage === GameStage.KNOWLEDGE_GAP ? "חיזוק זיכרון" : "הגרסה הישראלית"}
          </h3>
        </div>

        <div className="flex items-center gap-6">
          <button onClick={toggleMusic} className="p-2 hover:bg-white/5 transition-colors">
            {isMuted ? <VolumeX className="w-5 h-5 text-red-500" /> : <Volume2 className="w-5 h-5 text-blue-400" />}
          </button>
          <div className="text-right">
            <div className="text-[10px] text-gray-500 font-mono uppercase">דיוק</div>
            <div className="text-sm font-black text-yellow-400">
              {gameState.currentQuestionIndex > 0 
                ? Math.round((gameState.score / gameState.currentQuestionIndex) * 100) 
                : 100}%
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-gray-500 font-mono uppercase">התקדמות</div>
            <div className="text-sm font-black">
              {gameState.currentQuestionIndex + 1} / {gameState.totalQuestions}
            </div>
          </div>
          <button onClick={resetGame} className="p-2 hover:bg-white/5 transition-colors">
            <RotateCcw className="w-5 h-5 text-gray-500" />
          </button>
        </div>
      </header>

      {/* Progress Bar */}
      <div className="w-full h-2 bg-black">
        <motion.div 
          className="h-full bg-blue-600"
          initial={{ width: 0 }}
          animate={{ width: `${((gameState.currentQuestionIndex + 1) / gameState.totalQuestions) * 100}%` }}
        />
      </div>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center p-6 max-w-4xl mx-auto w-full z-10">
        <AnimatePresence mode="wait">
          {currentQuestion && (
            <motion.div 
              key={currentQuestion.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="w-full"
            >
              <div className="mb-12 text-center">
                <h2 className="text-3xl sm:text-5xl font-black mb-8 leading-tight tracking-tighter italic uppercase text-white drop-shadow-[4px_4px_0px_rgba(0,0,0,1)]">
                  {currentQuestion.text}
                </h2>
                
                {currentQuestion.image && (
                  <div className="relative inline-block group">
                    <div className="absolute inset-0 bg-blue-600/20 blur-3xl opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="pixel-panel p-2 bg-white">
                      <img 
                        src={currentQuestion.image} 
                        alt="Flag" 
                        className="h-48 sm:h-64 mx-auto relative z-10"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {currentQuestion.options.map((option, idx) => {
                  const isSelected = selectedOption === option;
                  const isCorrectAnswer = option === currentQuestion.correctAnswer;
                  
                  let buttonClass = "pixel-panel p-6 text-right transition-all duration-200 group relative overflow-hidden";
                  if (showFeedback) {
                    if (isCorrectAnswer) buttonClass = "pixel-panel !border-green-500 !bg-green-500/20 p-6 text-right transition-all duration-200";
                    else if (isSelected && !isCorrect) buttonClass = "pixel-panel !border-red-600 !bg-red-600/20 p-6 text-right transition-all duration-200";
                    else buttonClass = "pixel-panel p-6 text-right opacity-40 transition-all duration-200";
                  } else {
                    buttonClass += " hover:!border-white hover:bg-white/5";
                  }

                  return (
                    <button
                      key={idx}
                      onClick={() => handleAnswer(option)}
                      disabled={showFeedback}
                      className={buttonClass}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-2xl font-black italic">{option}</span>
                        <div className="flex items-center gap-3">
                          {showFeedback && isCorrectAnswer && <CheckCircle2 className="w-8 h-8 text-green-500" />}
                          {showFeedback && isSelected && !isCorrect && <XCircle className="w-8 h-8 text-red-600" />}
                          <span className="font-mono text-xs opacity-20 group-hover:opacity-100 transition-opacity">0{idx + 1}</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer Feedback */}
      <AnimatePresence>
        {showFeedback && (
          <motion.div 
            initial={{ y: 100 }}
            animate={{ y: 0 }}
            exit={{ y: 100 }}
            className={cn(
              "fixed bottom-0 left-0 right-0 p-8 text-center font-black text-3xl uppercase italic tracking-tighter z-50 border-t-4 border-black",
              isCorrect ? "bg-green-500 text-black" : "bg-[#ff0000] text-white"
            )}
          >
            {isCorrect ? "נכון מאוד!" : `טעות! התשובה הנכונה היא: ${currentQuestion.correctAnswer}`}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
