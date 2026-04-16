import React, { useState, useCallback, useEffect } from 'react';
import ReactFlow, { 
  addEdge, 
  Background, 
  Controls, 
  MiniMap,
  Connection,
  Edge,
  Node as FlowNode,
  Panel as FlowPanel
} from 'reactflow';
import { 
  Activity, 
  Database, 
  Map as MapIcon, 
  ShieldCheck, 
  AlertTriangle,
  Search,
  Plus,
  Send,
  Settings,
  Users,
  Trash2,
  UserPlus,
  LogOut,
  Lock
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";

const initialNodes: FlowNode[] = [];

const initialEdges: Edge[] = [];

import { TechnicalTable } from "@/src/components/TechnicalTable";
import { FiberNode, FTM, GPON, AppUser, Whitelist } from "@/src/types";
import { db, auth } from "@/src/lib/firebase";
import { collection, query, orderBy, onSnapshot, addDoc, deleteDoc, doc, where } from 'firebase/firestore';
import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User } from 'firebase/auth';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
}

export default function App() {
  const [activeTab, setActiveTab] = useState("tracking");
  const [nodes, setNodes] = useState<FlowNode[]>(initialNodes);
  const [edges, setEdges] = useState<Edge[]>(initialEdges);
  const [technicalData, setTechnicalData] = useState<FiberNode[]>([]);
  const [ftms, setFtms] = useState<FTM[]>([]);
  const [gpons, setGpons] = useState<GPON[]>([]);
  const [appUsers, setAppUsers] = useState<AppUser[]>([]);
  const [whitelist, setWhitelist] = useState<Whitelist[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [selectedOdcFilter, setSelectedOdcFilter] = useState<string>("ALL");
  const [selectedFtmFilter, setSelectedFtmFilter] = useState<string>("ALL");
  const [selectedOdpFilter, setSelectedOdpFilter] = useState<string>("ALL");

  // Custom Login State
  const [showCustomLogin, setShowCustomLogin] = useState(false);
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [customUser, setCustomUser] = useState<AppUser | null>(null);

  const isAdmin = (user?.email === 'eckyrahmad769@gmail.com' || customUser?.role === 'admin' || customUser?.username === 'ecky');

  // Admin/Settings Form States
  const [newFtmName, setNewFtmName] = useState("");
  const [newGponName, setNewGponName] = useState("");
  const [selectedFtmId, setSelectedFtmId] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newWhitelistId, setNewWhitelistId] = useState("");
  const [newWhitelistName, setNewWhitelistName] = useState("");

  // Handle Auth State
  useEffect(() => {
    return onAuthStateChanged(auth, (user) => {
      setUser(user);
      setIsAuthReady(true);
    });
  }, []);

  const login = async () => {
    // Show custom login modal instead of Google popup
    setShowCustomLogin(true);
  };

  const handleCustomLogin = (e: React.FormEvent) => {
    e.preventDefault();
    // Admin check
    if (loginUsername === "ecky" && loginPassword === "admin123") {
      const admin: AppUser = { id: "admin-ecky", username: "ecky", role: "admin" };
      setCustomUser(admin);
      setShowCustomLogin(false);
      return;
    }

    // Check registered users
    const foundUser = (appUsers || []).find(u => u.username === loginUsername && u.password === loginPassword);
    if (foundUser) {
      setCustomUser(foundUser);
      setShowCustomLogin(false);
    } else {
      setAuthError("Username atau Password salah.");
    }
  };

  // Dynamic Nodes for Network Explorer
  useEffect(() => {
    if (!technicalData || technicalData.length === 0) {
      setNodes([]);
      setEdges([]);
      return;
    }

    // Filter data based on search and selected filters
    let filtered = technicalData || [];
    if (selectedFtmFilter !== "ALL") {
      filtered = filtered.filter(d => d.ftm_name === selectedFtmFilter);
    }
    if (selectedOdcFilter !== "ALL") {
      filtered = filtered.filter(d => d.odc_name === selectedOdcFilter);
    }
    if (selectedOdpFilter !== "ALL") {
      filtered = filtered.filter(d => d.odp_name === selectedOdpFilter);
    }
    if (searchQuery) {
      const lowSearch = searchQuery.toLowerCase();
      filtered = filtered.filter(d => 
        d.odp_name.toLowerCase().includes(lowSearch) || 
        d.odc_name.toLowerCase().includes(lowSearch) ||
        d.ftm_name.toLowerCase().includes(lowSearch)
      );
    }

    if (!filtered || filtered.length === 0) {
      setNodes([]);
      setEdges([]);
      return;
    }

    const newNodes: FlowNode[] = [];
    const newEdges: Edge[] = [];
    
    // Track unique nodes to prevent duplicates and build hierarchy
    const ftmNodes = new Set<string>();
    const oaNodes = new Set<string>();
    const eaNodes = new Set<string>();
    const odcNodes = new Set<string>();
    const odpNodes = new Set<string>();

    const SPACING_X = 280;
    const SPACING_Y = 100;

    // We'll use a simple vertical distribution for now
    const levelCounts = [0, 0, 0, 0, 0];

    // Sort filtered data to keep visualization consistent
    const sortedData = [...filtered].sort((a, b) => a.odp_name.localeCompare(b.odp_name));

    sortedData.forEach((d) => {
      // 1. FTM (Level 0)
      const ftmId = `ftm-${d.ftm_name}`;
      if (!ftmNodes.has(ftmId)) {
        ftmNodes.add(ftmId);
        newNodes.push({
          id: ftmId,
          type: 'input',
          data: { label: `FTM ${d.ftm_name}` },
          position: { x: 0, y: levelCounts[0] * SPACING_Y },
          style: { background: '#1e40af', color: '#fff', borderRadius: '12px', border: 'none', width: 200, fontWeight: 'bold' }
        });
        levelCounts[0]++;
      }

      // 2. OA (Level 1)
      const oaId = `oa-${d.ftm_name}-${d.oa_rak}-${d.oa_panel}-${d.oa_port}`;
      if (!oaNodes.has(oaId)) {
        oaNodes.add(oaId);
        newNodes.push({
          id: oaId,
          data: { label: `OA R:${d.oa_rak} P:${d.oa_panel} T:${d.oa_port}` },
          position: { x: SPACING_X, y: levelCounts[1] * SPACING_Y },
          style: { background: '#334155', color: '#fff', borderRadius: '12px', border: 'none', width: 200, fontSize: '11px' }
        });
        newEdges.push({ 
          id: `e-${ftmId}-${oaId}`, 
          source: ftmId, 
          target: oaId, 
          animated: true,
          style: { stroke: '#94a3b8' }
        });
        levelCounts[1]++;
      }

      // 3. EA (Level 2)
      const eaId = `ea-${d.ftm_name}-${d.ea_rak}-${d.ea_panel}-${d.ea_port}`;
      if (!eaNodes.has(eaId)) {
        eaNodes.add(eaId);
        newNodes.push({
          id: eaId,
          data: { label: `EA R:${d.ea_rak} P:${d.ea_panel} T:${d.ea_port}` },
          position: { x: SPACING_X * 2, y: levelCounts[2] * SPACING_Y },
          style: { background: '#334155', color: '#fff', borderRadius: '12px', border: 'none', width: 200, fontSize: '11px' }
        });
        newEdges.push({ 
          id: `e-${oaId}-${eaId}`, 
          source: oaId, 
          target: eaId, 
          animated: true,
          style: { stroke: '#94a3b8' }
        });
        levelCounts[2]++;
      }

      // 4. ODC (Level 3)
      const odcId = `odc-${d.odc_name}`;
      if (!odcNodes.has(odcId)) {
        odcNodes.add(odcId);
        newNodes.push({
          id: odcId,
          data: { label: `ODC: ${d.odc_name}` },
          position: { x: SPACING_X * 3, y: levelCounts[3] * SPACING_Y },
          style: { background: '#0f172a', color: '#fff', borderRadius: '12px', border: '2px solid #3b82f6', width: 200, fontWeight: 'bold' }
        });
        newEdges.push({ 
          id: `e-${eaId}-${odcId}`, 
          source: eaId, 
          target: odcId, 
          animated: true,
          style: { stroke: '#3b82f6', strokeWidth: 2 }
        });
        levelCounts[3]++;
      }

      // 5. ODP (Level 4)
      const odpId = `odp-${d.odp_name}`;
      if (!odpNodes.has(odpId)) {
        odpNodes.add(odpId);
        newNodes.push({
          id: odpId,
          type: 'output',
          data: { label: `ODP: ${d.odp_name}` },
          position: { x: SPACING_X * 4, y: levelCounts[4] * SPACING_Y },
          style: { background: '#f59e0b', color: '#fff', borderRadius: '12px', border: 'none', width: 200, fontWeight: 'bold' }
        });
        newEdges.push({ 
          id: `e-${odcId}-${odpId}`, 
          source: odcId, 
          target: odpId, 
          animated: true,
          style: { stroke: '#f59e0b', strokeWidth: 2 }
        });
        levelCounts[4]++;
      }
    });

    setNodes(newNodes);
    setEdges(newEdges);
  }, [technicalData, selectedOdcFilter, selectedFtmFilter, selectedOdpFilter, searchQuery]);

  // Unique names for filters
  const ftmList = Array.from(new Set((technicalData || []).map(d => d.ftm_name))).filter(Boolean).sort();
  const odcList = Array.from(new Set((technicalData || []).map(d => d.odc_name))).filter(Boolean).sort();
  const odpList = Array.from(new Set((technicalData || []).map(d => d.odp_name))).filter(Boolean).sort();

  // Fetch initial data and subscribe to changes via Firebase
  useEffect(() => {
    if (!isAuthReady) return;
    // We now allow fetching technical data even if not logged in
    // but we still restrict admin data (users, whitelist)

    const qValidations = query(collection(db, 'validations'), orderBy('created_at', 'desc'));
    const unsubValidations = onSnapshot(qValidations, (snapshot) => {
      const mappedData: FiberNode[] = snapshot.docs.map((doc) => {
        const item = doc.data();
        return {
          id: doc.id,
          status: item.status || 'PENDING',
          lastValidatedAt: item.created_at?.toDate ? item.created_at.toDate().toLocaleString() : 'JUST NOW',
          ftm_name: item.ftm_name || '-',
          gpon_name: item.gpon_name || '-',
          oa_rak: item.oa_rak || '-',
          oa_panel: item.oa_panel || '-',
          oa_port: item.oa_port || '-',
          ea_rak: item.ea_rak || '-',
          ea_panel: item.ea_panel || '-',
          ea_port: item.ea_port || '-',
          odc_name: item.odc_name || '-',
          odc_feeder_panel: item.odc_feeder_panel || '-',
          odc_feeder_port: item.odc_feeder_port || '-',
          odc_dist_panel: item.odc_dist_panel || '-',
          odc_dist_port: item.odc_dist_port || '-',
          odp_name: item.odp_name || '-',
          technician_name: item.technician_name || '-'
        };
      });
      setTechnicalData(mappedData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'validations');
    });

    const unsubFtms = onSnapshot(collection(db, 'ftms'), (snapshot) => {
      setFtms(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FTM)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'ftms');
    });

    const unsubGpons = onSnapshot(collection(db, 'gpons'), (snapshot) => {
      setGpons(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as GPON)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'gpons');
    });

    // Only subscribe to sensitive data if logged in
    let unsubUsers = () => {};
    let unsubWhitelist = () => {};

    if (user || customUser) {
      unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
        setAppUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AppUser)));
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, 'users');
      });

      unsubWhitelist = onSnapshot(collection(db, 'whitelist'), (snapshot) => {
        setWhitelist(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Whitelist)));
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, 'whitelist');
      });
    } else {
      // If not logged in, we still need users for the login check
      unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
        setAppUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AppUser)));
      }, (error) => {
        // Don't throw here to avoid crashing the login screen, but log it
        console.error('Users fetch error (unauthenticated):', error);
      });
    }

    return () => {
      unsubValidations();
      unsubFtms();
      unsubGpons();
      unsubUsers();
      unsubWhitelist();
    };
  }, [user, customUser, isAuthReady]);

  // Admin Actions
  const handleAddFtm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFtmName) return;
    try {
      await addDoc(collection(db, 'ftms'), { name: newFtmName.toUpperCase() });
      setNewFtmName("");
    } catch (err) { console.error(err); }
  };

  const handleAddGpon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGponName || !selectedFtmId) return;
    try {
      await addDoc(collection(db, 'gpons'), { 
        name: newGponName.toUpperCase(), 
        ftm_id: selectedFtmId 
      });
      setNewGponName("");
    } catch (err) { console.error(err); }
  };

  const handleDeleteFtm = async (id: string) => {
    try { await deleteDoc(doc(db, 'ftms', id)); } catch (err) { console.error(err); }
  };

  const handleDeleteGpon = async (id: string) => {
    try { await deleteDoc(doc(db, 'gpons', id)); } catch (err) { console.error(err); }
  };

  const handleDeleteValidation = async (id: string) => {
    try { await deleteDoc(doc(db, 'validations', id)); } catch (err) { console.error(err); }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername || !newPassword) return;
    try {
      await addDoc(collection(db, 'users'), { 
        username: newUsername, 
        password: newPassword, 
        role: 'technician' 
      });
      setNewUsername(""); setNewPassword("");
    } catch (err) { console.error(err); }
  };

  const handleAddWhitelist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWhitelistId || !newWhitelistName) return;
    try {
      await addDoc(collection(db, 'whitelist'), { 
        telegram_id: newWhitelistId, 
        name: newWhitelistName 
      });
      setNewWhitelistId(""); setNewWhitelistName("");
    } catch (err) { console.error(err); }
  };

  // Advanced Filtering
  const filteredData = (technicalData || []).filter((item) => {
    const query = searchQuery.toUpperCase();
    const matchesSearch = (
      item.odp_name?.toUpperCase().includes(query) ||
      item.odc_name?.toUpperCase().includes(query) ||
      item.ftm_name?.toUpperCase().includes(query) ||
      item.gpon_name?.toUpperCase().includes(query) ||
      item.technician_name?.toUpperCase().includes(query)
    );
    const matchesFtm = selectedFtmFilter === "ALL" || item.ftm_name === selectedFtmFilter;
    const matchesOdc = selectedOdcFilter === "ALL" || item.odc_name === selectedOdcFilter;
    const matchesOdp = selectedOdpFilter === "ALL" || item.odp_name === selectedOdpFilter;
    return matchesSearch && matchesFtm && matchesOdc && matchesOdp;
  });

  // Derived stats based on filtered data
  const totalPorts = (filteredData || []).length;
  const pendingValidations = (filteredData || []).filter(d => d.status === 'PENDING').length;
  const successRate = totalPorts > 0 ? (((filteredData || []).filter(d => d.status === 'VALID').length / totalPorts) * 100).toFixed(1) : "0";

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    []
  );

  if (!isAuthReady) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#f0f2f5]">
        <div className="flex flex-col items-center text-slate-400">
          <Activity size={48} className="mb-4 animate-pulse text-blue-500" />
          <p className="text-sm font-medium">Loading FiberTrace...</p>
        </div>
      </div>
    );
  }

  if (!user && !customUser) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#f0f2f5] p-4">
        <Card className="w-full max-w-md shadow-2xl border-none">
          <CardHeader className="text-center">
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 mx-auto mb-4">
              <Lock size={24} />
            </div>
            <CardTitle className="text-2xl">FiberTrace Login</CardTitle>
            <CardDescription>Enter your credentials to access the dashboard</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCustomLogin} className="space-y-4">
              {authError && (
                <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100 text-center">
                  {authError}
                </div>
              )}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase">Username</label>
                <Input 
                  placeholder="Username" 
                  value={loginUsername} 
                  onChange={e => setLoginUsername(e.target.value)}
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase">Password</label>
                <Input 
                  type="password" 
                  placeholder="••••••••" 
                  value={loginPassword} 
                  onChange={e => setLoginPassword(e.target.value)}
                  className="h-11"
                />
              </div>
              <Button type="submit" className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-base font-bold">
                Sign In
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#f0f2f5] font-sans text-[#1e293b]">
      {/* Sidebar */}
      <aside className="w-[240px] border-r border-[#e2e8f0] bg-white flex flex-col p-6">
        <div className="flex items-center gap-2 mb-10">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 20h20"/><path d="M5 20v-8a7 7 0 0 1 14 0v8"/><path d="M9 20v-4a3 3 0 0 1 6 0v4"/></svg>
          <h1 className="text-xl font-extrabold tracking-tight text-[#2563eb]">MAINCORE</h1>
        </div>

        <nav className="flex-1">
          <ul className="space-y-1">
            <li onClick={() => setActiveTab("tracking")} className={`sidebar-item ${activeTab === "tracking" ? "active" : ""}`}>
              <MapIcon size={18} className="mr-3" /> Network Explorer
            </li>
            <li onClick={() => setActiveTab("data")} className={`sidebar-item ${activeTab === "data" ? "active" : ""}`}>
              <Database size={18} className="mr-3" /> Asset Inventory
            </li>
            {isAdmin && (
              <>
                <li onClick={() => setActiveTab("admin")} className={`sidebar-item ${activeTab === "admin" ? "active" : ""}`}>
                  <Users size={18} className="mr-3" /> User Management
                </li>
                <li onClick={() => setActiveTab("settings")} className={`sidebar-item ${activeTab === "settings" ? "active" : ""}`}>
                  <Settings size={18} className="mr-3" /> Settings
                </li>
              </>
            )}
          </ul>
        </nav>

        <div className="mt-auto pt-6 border-t border-[#e2e8f0]">
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">System Status</p>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-xs font-semibold text-slate-700">Sync Active</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col p-8 overflow-hidden">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
          <header className="flex items-center justify-between mb-8 shrink-0">
            <h1 className="text-3xl font-bold tracking-tight text-[#1e293b]">
              {activeTab === "tracking" ? "Network Explorer" : 
               activeTab === "data" ? "Asset Inventory" : 
               activeTab === "admin" ? "User Management" : "System Settings"}
            </h1>
            
            <div className="flex items-center gap-6">
              {authError && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 border border-red-100 rounded-lg text-red-600 text-xs animate-in fade-in slide-in-from-top-1">
                  <AlertTriangle size={14} />
                  {authError}
                  <button onClick={() => setAuthError(null)} className="ml-2 hover:text-red-800 font-bold">×</button>
                </div>
              )}
              
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input 
                  placeholder="Search ODP, ODC, Port..." 
                  className="pl-10 h-10 bg-white border-[#e2e8f0] focus:ring-2 focus:ring-blue-500 transition-all text-sm"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div className="flex items-center gap-3">
                <div className="flex flex-col items-end">
                  <span className="text-xs font-bold text-slate-700">{(user?.displayName || customUser?.username)}</span>
                  <span className="text-[10px] text-slate-400 uppercase font-bold">
                    {customUser?.role === 'admin' || user?.email === 'eckyrahmad769@gmail.com' ? 'Administrator' : 'Technician'}
                  </span>
                </div>
                <Button onClick={() => { auth.signOut(); setCustomUser(null); }} variant="ghost" size="icon" className="text-slate-400 hover:text-red-500">
                  <LogOut size={18} />
                </Button>
              </div>

              <div className="bot-status-pill">
                <div className="w-2 h-2 rounded-full bg-[#10b981]" />
                Bot Active
              </div>
            </div>
          </header>

          <TabsContent value="tracking" className="flex-1 relative bg-white rounded-2xl border border-[#e2e8f0] m-0 overflow-hidden shadow-sm flex flex-col">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2">
                <MapIcon size={16} className="text-blue-600" />
                <span className="text-sm font-bold text-slate-700">Live Network Visualization</span>
              </div>
              <div className="flex items-center gap-2 overflow-x-auto pb-1 max-w-[70%]">
                {/* FTM Filter */}
                <div className="flex items-center gap-2 bg-white px-2 py-1 rounded-lg border border-slate-200 shadow-sm shrink-0">
                  <span className="text-[9px] font-bold text-slate-500 uppercase tracking-tight">FTM:</span>
                  <select 
                    className="text-[11px] border-none bg-transparent font-semibold text-blue-600 outline-none cursor-pointer"
                    value={selectedFtmFilter}
                    onChange={(e) => setSelectedFtmFilter(e.target.value)}
                  >
                    <option value="ALL">ALL</option>
                    {ftmList.map(ftm => (
                      <option key={ftm} value={ftm}>{ftm}</option>
                    ))}
                  </select>
                </div>

                {/* ODC Filter */}
                <div className="flex items-center gap-2 bg-white px-2 py-1 rounded-lg border border-slate-200 shadow-sm shrink-0">
                  <span className="text-[9px] font-bold text-slate-500 uppercase tracking-tight">ODC:</span>
                  <select 
                    className="text-[11px] border-none bg-transparent font-semibold text-blue-600 outline-none cursor-pointer"
                    value={selectedOdcFilter}
                    onChange={(e) => setSelectedOdcFilter(e.target.value)}
                  >
                    <option value="ALL">ALL</option>
                    {odcList.map(odc => (
                      <option key={odc} value={odc}>{odc}</option>
                    ))}
                  </select>
                </div>

                {/* ODP Filter */}
                <div className="flex items-center gap-2 bg-white px-2 py-1 rounded-lg border border-slate-200 shadow-sm shrink-0">
                  <span className="text-[9px] font-bold text-slate-500 uppercase tracking-tight">ODP:</span>
                  <select 
                    className="text-[11px] border-none bg-transparent font-semibold text-blue-600 outline-none cursor-pointer"
                    value={selectedOdpFilter}
                    onChange={(e) => setSelectedOdpFilter(e.target.value)}
                  >
                    <option value="ALL">ALL</option>
                    {odpList.map(odp => (
                      <option key={odp} value={odp}>{odp}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <div className="flex-1 relative">
              {(!nodes || nodes.length === 0) ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-50/50 text-slate-400">
                  <Activity size={48} className="mb-4 opacity-20" />
                  <p className="text-sm font-medium">No network data available yet</p>
                  <p className="text-[10px] uppercase tracking-widest mt-1">Waiting for field input via Telegram...</p>
                </div>
              ) : (
                <ReactFlow
                  nodes={nodes}
                  edges={edges}
                  onConnect={onConnect}
                  fitView
                >
                  <Background color="#cbd5e1" gap={20} />
                  <Controls />
                  <MiniMap 
                    nodeColor={(n) => {
                      if (n.type === 'input') return '#3b82f6';
                      if (n.type === 'output') return '#f59e0b';
                      return '#cbd5e1';
                    }}
                  />
                  <FlowPanel position="bottom-left" className="bg-white p-4 rounded-xl shadow-lg border border-slate-200 m-4 max-w-md w-full">
                    <div className="flex justify-between items-center text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                      <span>Last Telegram Input</span>
                      <span>Sync Time: {technicalData[0]?.lastValidatedAt || 'N/A'}</span>
                    </div>
                    <p className="text-xs mt-2 text-slate-600">
                      <strong>{technicalData[0]?.odp_name || 'No data'}</strong> - {technicalData[0]?.technician_name || 'System'}
                    </p>
                  </FlowPanel>
                </ReactFlow>
              )}
            </div>
            
            {/* Bottom List for Tracking Tab */}
            <div className="h-1/3 border-t border-slate-100 overflow-auto bg-white">
              <TechnicalTable data={filteredData.slice(0, 5)} isAdmin={isAdmin} onDelete={handleDeleteValidation} />
            </div>
          </TabsContent>

        <TabsContent value="data" className="flex-1 m-0 overflow-auto flex flex-col gap-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* FTM Management */}
            <Card className="border-[#e2e8f0] shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg">Manage FTM</CardTitle>
                <CardDescription>Add or remove Central Office (FTM) nodes</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <form onSubmit={handleAddFtm} className="flex gap-2">
                  <Input 
                    placeholder="FTM Name (e.g. GAMBIR)" 
                    value={newFtmName}
                    onChange={(e) => setNewFtmName(e.target.value)}
                    disabled={!isAdmin}
                  />
                  <Button type="submit" size="icon" className="shrink-0" disabled={!isAdmin}>
                    <Plus size={18} />
                  </Button>
                </form>
                {!isAdmin && <p className="text-[10px] text-amber-600 font-medium">Administrator access required</p>}
                <div className="space-y-2 max-h-[200px] overflow-auto">
                  {(ftms || []).map(ftm => (
                    <div key={ftm.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100">
                      <span className="font-semibold text-slate-700">{ftm.name}</span>
                      {isAdmin && (
                        <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => handleDeleteFtm(ftm.id)}>
                          <Trash2 size={14} />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* GPON Management */}
            <Card className="border-[#e2e8f0] shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg">Manage GPON</CardTitle>
                <CardDescription>Add GPONs to specific FTMs</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <form onSubmit={handleAddGpon} className="space-y-3">
                  <select 
                    className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50"
                    value={selectedFtmId}
                    onChange={(e) => setSelectedFtmId(e.target.value)}
                    disabled={!isAdmin}
                  >
                    <option value="">Select FTM...</option>
                    {(ftms || []).map(ftm => (
                      <option key={ftm.id} value={ftm.id}>{ftm.name}</option>
                    ))}
                  </select>
                  <div className="flex gap-2">
                    <Input 
                      placeholder="GPON Name (e.g. GPON-01)" 
                      value={newGponName}
                      onChange={(e) => setNewGponName(e.target.value)}
                      disabled={!isAdmin}
                    />
                    <Button type="submit" size="icon" className="shrink-0" disabled={!isAdmin}>
                      <Plus size={18} />
                    </Button>
                  </div>
                </form>
                {!isAdmin && <p className="text-[10px] text-amber-600 font-medium">Administrator access required</p>}
                <div className="space-y-2 max-h-[200px] overflow-auto">
                  {(gpons || []).map(gpon => {
                    const ftm = (ftms || []).find(f => f.id === gpon.ftm_id);
                    return (
                      <div key={gpon.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100">
                        <div>
                          <span className="font-semibold text-slate-700">{gpon.name}</span>
                          <span className="ml-2 text-[10px] text-slate-400 uppercase tracking-tighter">CO: {ftm?.name || 'Unknown'}</span>
                        </div>
                        {isAdmin && (
                          <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => handleDeleteGpon(gpon.id)}>
                            <Trash2 size={14} />
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
          <div className="flex-1 overflow-auto">
            <TechnicalTable data={filteredData} isAdmin={isAdmin} onDelete={handleDeleteValidation} />
          </div>
        </TabsContent>

        <TabsContent value="admin" className="flex-1 m-0 overflow-auto flex flex-col gap-6">
          <Card className="border-[#e2e8f0] shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="text-blue-600" />
                User Management
              </CardTitle>
              <CardDescription>Create and manage application users</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <form onSubmit={handleAddUser} className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Input placeholder="Username" value={newUsername} onChange={e => setNewUsername(e.target.value)} disabled={!isAdmin} />
                <Input placeholder="Password" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} disabled={!isAdmin} />
                <Button type="submit" disabled={!isAdmin}><UserPlus size={18} className="mr-2" /> Add User</Button>
              </form>
              {!isAdmin && <p className="text-[10px] text-amber-600 font-medium">Administrator access required</p>}
              <div className="space-y-2">
                {(appUsers || []).map(u => (
                  <div key={u.id} className="flex items-center justify-between p-4 bg-white border border-slate-100 rounded-xl shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold">
                        {u.username?.[0]?.toUpperCase() || '?'}
                      </div>
                      <div>
                        <p className="font-bold text-slate-700">{u.username}</p>
                        <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">{u.role}</p>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" className="text-slate-400 hover:text-red-500" onClick={() => deleteDoc(doc(db, 'users', u.id))}>
                      <Trash2 size={16} />
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="flex-1 m-0 overflow-auto flex flex-col gap-6">
          <Card className="border-[#e2e8f0] shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="text-blue-600" />
                Telegram Whitelist
              </CardTitle>
              <CardDescription>Only whitelisted Telegram IDs can interact with the bot</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <form onSubmit={handleAddWhitelist} className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Input placeholder="Telegram ID (e.g. 12345678)" value={newWhitelistId} onChange={e => setNewWhitelistId(e.target.value)} disabled={!isAdmin} />
                <Input placeholder="Technician Name" value={newWhitelistName} onChange={e => setNewWhitelistName(e.target.value)} disabled={!isAdmin} />
                <Button type="submit" disabled={!isAdmin}><Plus size={18} className="mr-2" /> Add to Whitelist</Button>
              </form>
              {!isAdmin && <p className="text-[10px] text-amber-600 font-medium">Administrator access required</p>}
              <div className="space-y-2">
                {(whitelist || []).map(w => (
                  <div key={w.id} className="flex items-center justify-between p-4 bg-white border border-slate-100 rounded-xl shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 font-bold">
                        <Send size={14} />
                      </div>
                      <div>
                        <p className="font-bold text-slate-700">{w.name}</p>
                        <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">ID: {w.telegram_id}</p>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" className="text-slate-400 hover:text-red-500" onClick={() => deleteDoc(doc(db, 'whitelist', w.id))}>
                      <Trash2 size={16} />
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="grid grid-cols-3 gap-6 mt-8">
        <div className="geometric-card p-5">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Total Port Managed</div>
          <div className="text-2xl font-bold">{totalPorts.toLocaleString()}</div>
        </div>
        <div className="geometric-card p-5">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Pending Validations</div>
          <div className="text-2xl font-bold text-[#f59e0b]">{pendingValidations}</div>
        </div>
        <div className="geometric-card p-5">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Success Rate</div>
          <div className="text-2xl font-bold text-[#10b981]">{successRate}%</div>
        </div>
      </div>
    </main>
  </div>
);
}
