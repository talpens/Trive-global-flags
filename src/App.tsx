import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, RotateCcw, Globe, MapPin, Flag, ChevronRight, CheckCircle2, XCircle, AlertTriangle, Users, Brain, LogIn, LogOut } from 'lucide-react';
import { cn } from './lib/utils';
import { GameStage, GameState, Question, UserStats } from './types';
import { generateQuestions } from './services/gameService';
import { auth, db } from './firebase';
import { GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut, User } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, collection, query, orderBy, limit, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  
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
      // Track mistake
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
        // Finish Game
        const finalScore = correct ? gameState.score + 1 : gameState.score;
        setGameState(prev => ({ ...prev, isFinished: true, score: finalScore }));
        
        // Update Firebase Stats
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
          
          // Refresh local stats
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
      <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col items-center justify-center p-6 font-sans" dir="rtl">
        <div className="absolute top-6 left-6 flex gap-4">
          {user ? (
            <div className="flex items-center gap-4 bg-white/5 p-2 pr-4 rounded-full border border-white/10">
              <span className="text-sm font-bold">{user.displayName}</span>
              <img src={user.photoURL || ''} className="w-8 h-8 rounded-full" />
              <button onClick={() => signOut(auth)} className="p-2 hover:text-red-500 transition-colors">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button onClick={login} className="flex items-center gap-2 bg-white text-black px-4 py-2 font-bold hover:bg-red-600 hover:text-white transition-all">
              <LogIn className="w-4 h-4" /> התחבר
            </button>
          )}
        </div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center max-w-2xl"
        >
          <div className="mb-8 flex justify-center">
            <div className="relative">
              <Globe className="w-24 h-24 text-red-600 animate-pulse" />
              <div className="absolute inset-0 bg-red-600/20 blur-2xl rounded-full" />
            </div>
          </div>
          
          <h1 className="text-6xl font-black mb-4 tracking-tighter uppercase italic">
            טריוויה <span className="text-red-600">HELL MODE</span>
          </h1>
          <p className="text-gray-400 text-xl mb-12 font-medium">
            האם אתה מסוגל לזכור את כל 195 המדינות? השלב הבא מחכה רק למי ששורד.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button 
              onClick={() => startStage(GameStage.COUNTRIES)}
              className="group relative overflow-hidden bg-white text-black font-bold py-6 px-8 rounded-none transition-all hover:bg-red-600 hover:text-white"
            >
              <div className="flex items-center justify-center gap-3">
                <Flag className="w-6 h-6" />
                <span className="text-2xl">התחל מסע עולמי</span>
              </div>
            </button>

            <button 
              onClick={() => startStage(GameStage.COUNTRIES, { isAllOrNothing: true })}
              className="group relative overflow-hidden bg-red-600 text-white font-bold py-6 px-8 rounded-none transition-all hover:bg-black"
            >
              <div className="flex items-center justify-center gap-3">
                <AlertTriangle className="w-6 h-6" />
                <span className="text-2xl">הכל או כלום</span>
              </div>
            </button>

            <button 
              onClick={() => startStage(GameStage.LOCAL_MODE, { localCountry: 'ישראל' })}
              className="group relative overflow-hidden border-2 border-white text-white font-bold py-6 px-8 rounded-none transition-all hover:bg-white hover:text-black"
            >
              <div className="flex items-center justify-center gap-3">
                <MapPin className="w-6 h-6" />
                <span className="text-2xl">הגרסה הישראלית</span>
              </div>
            </button>

            <button 
              disabled={topMistakes.length === 0}
              onClick={() => startStage(GameStage.KNOWLEDGE_GAP, { targetCountryCodes: topMistakes })}
              className="group relative overflow-hidden border-2 border-red-600 text-red-600 font-bold py-6 px-8 rounded-none transition-all hover:bg-red-600 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <div className="flex items-center justify-center gap-3">
                <Brain className="w-6 h-6" />
                <span className="text-2xl">מה נשאר לי לדעת?</span>
              </div>
            </button>
          </div>

          <div className="mt-8">
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
              <div className="bg-zinc-900 border border-white/10 p-8 max-w-md w-full">
                <h2 className="text-3xl font-black mb-6 italic uppercase">טבלת מובילים</h2>
                <div className="space-y-4 mb-8">
                  {leaderboard.map((entry, i) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-white/5 border-r-4 border-red-600">
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-gray-500">#{i+1}</span>
                        <span className="font-bold">{entry.displayName}</span>
                      </div>
                      <span className="text-red-500 font-black">{entry.score}</span>
                    </div>
                  ))}
                </div>
                <button onClick={() => setShowLeaderboard(false)} className="w-full bg-white text-black font-bold py-3 hover:bg-red-600 hover:text-white transition-all">
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
      <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col items-center justify-center p-6 font-sans" dir="rtl">
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-center max-w-xl w-full border border-white/10 p-12 bg-zinc-900/50 backdrop-blur-xl"
        >
          <Trophy className={cn("w-24 h-24 mx-auto mb-6", isPerfect ? "text-yellow-500" : "text-gray-400")} />
          <h2 className="text-5xl font-black mb-2 uppercase italic">
            {isPerfect ? "שלמות מוחלטת!" : "סוף השלב"}
          </h2>
          <p className="text-gray-400 mb-8 text-lg">
            צדקת ב-<span className="text-white font-bold">{gameState.score}</span> מתוך <span className="text-white font-bold">{gameState.totalQuestions}</span> שאלות.
          </p>

          <div className="w-full bg-white/5 h-4 mb-12 overflow-hidden">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${successRate}%` }}
              className="h-full bg-red-600"
            />
          </div>

          <div className="flex flex-col gap-4">
            {isPerfect && gameState.stage < GameStage.LOCAL_MODE && (
              <button 
                onClick={() => startStage(gameState.stage + 1, { localCountry: gameState.localCountry })}
                className="bg-red-600 text-white font-black py-4 px-8 flex items-center justify-center gap-2 hover:bg-red-700 transition-colors"
              >
                עבור לשלב הבא <ChevronRight className="w-5 h-5" />
              </button>
            )}
            
            {!isPerfect && (
              <div className="bg-red-600/10 border border-red-600/20 p-4 mb-4 flex items-center gap-3 text-red-500 text-right">
                <AlertTriangle className="w-6 h-6 shrink-0" />
                <p className="text-sm font-bold">
                  כדי לעבור לשלב הבא עליך להשיג 100% הצלחה. נסה שוב!
                </p>
              </div>
            )}

            <button 
              onClick={() => startStage(gameState.stage, { localCountry: gameState.localCountry, isAllOrNothing: gameState.isAllOrNothing })}
              className="border border-white/20 text-white font-bold py-4 px-8 flex items-center justify-center gap-2 hover:bg-white hover:text-black transition-all"
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
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col font-sans" dir="rtl">
      {/* Header */}
      <header className="p-6 border-b border-white/5 flex items-center justify-between bg-black/50 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <div className="bg-red-600 text-white px-3 py-1 font-black italic text-sm">
            {gameState.isAllOrNothing ? "ALL OR NOTHING" : `STAGE 0${gameState.stage}`}
          </div>
          <h3 className="font-mono text-xs text-gray-500 uppercase tracking-widest hidden sm:block">
            {gameState.stage === GameStage.COUNTRIES ? "זיהוי דגלים" : 
             gameState.stage === GameStage.CAPITALS ? "ערי בירה" :
             gameState.stage === GameStage.SUBURBS ? "פרוורים עולמיים" : 
             gameState.stage === GameStage.KNOWLEDGE_GAP ? "חיזוק זיכרון" : "הגרסה הישראלית"}
          </h3>
        </div>

        <div className="flex items-center gap-6">
          <div className="text-right">
            <div className="text-[10px] text-gray-500 font-mono uppercase">דיוק</div>
            <div className="text-sm font-black text-red-500">
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
      <div className="w-full h-1 bg-white/5">
        <motion.div 
          className="h-full bg-red-600"
          initial={{ width: 0 }}
          animate={{ width: `${((gameState.currentQuestionIndex + 1) / gameState.totalQuestions) * 100}%` }}
        />
      </div>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center p-6 max-w-4xl mx-auto w-full">
        <AnimatePresence mode="wait">
          {currentQuestion && (
            <motion.div 
              key={currentQuestion.id}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="w-full"
            >
              <div className="mb-12 text-center">
                <h2 className="text-3xl sm:text-4xl font-black mb-8 leading-tight">
                  {currentQuestion.text}
                </h2>
                
                {currentQuestion.image && (
                  <div className="relative inline-block group">
                    <div className="absolute inset-0 bg-red-600/20 blur-3xl opacity-0 group-hover:opacity-100 transition-opacity" />
                    <img 
                      src={currentQuestion.image} 
                      alt="Flag" 
                      className="h-48 sm:h-64 mx-auto shadow-2xl border-4 border-white/10 relative z-10"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {currentQuestion.options.map((option, idx) => {
                  const isSelected = selectedOption === option;
                  const isCorrectAnswer = option === currentQuestion.correctAnswer;
                  
                  let buttonClass = "relative overflow-hidden border-2 border-white/10 p-6 text-right transition-all duration-200 group";
                  if (showFeedback) {
                    if (isCorrectAnswer) buttonClass = "relative overflow-hidden border-2 border-green-500 bg-green-500/10 p-6 text-right transition-all duration-200";
                    else if (isSelected && !isCorrect) buttonClass = "relative overflow-hidden border-2 border-red-600 bg-red-600/10 p-6 text-right transition-all duration-200";
                    else buttonClass = "relative overflow-hidden border-2 border-white/5 p-6 text-right opacity-40 transition-all duration-200";
                  } else {
                    buttonClass += " hover:border-white hover:bg-white/5";
                  }

                  return (
                    <button
                      key={idx}
                      onClick={() => handleAnswer(option)}
                      disabled={showFeedback}
                      className={buttonClass}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xl font-bold">{option}</span>
                        <div className="flex items-center gap-3">
                          {showFeedback && isCorrectAnswer && <CheckCircle2 className="w-6 h-6 text-green-500" />}
                          {showFeedback && isSelected && !isCorrect && <XCircle className="w-6 h-6 text-red-600" />}
                          <span className="font-mono text-xs opacity-20 group-hover:opacity-100 transition-opacity">0{idx + 1}</span>
                        </div>
                      </div>
                      {!showFeedback && (
                        <div className="absolute bottom-0 right-0 h-1 bg-white w-0 group-hover:w-full transition-all duration-300" />
                      )}
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
              "fixed bottom-0 left-0 right-0 p-6 text-center font-black text-2xl uppercase italic tracking-tighter z-50",
              isCorrect ? "bg-green-500 text-black" : "bg-red-600 text-white"
            )}
          >
            {isCorrect ? "נכון מאוד!" : `טעות! התשובה הנכונה היא: ${currentQuestion.correctAnswer}`}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
