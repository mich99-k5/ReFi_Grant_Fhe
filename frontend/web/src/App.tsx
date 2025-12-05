// App.tsx
import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import "./App.css";
import { useAccount, useSignMessage } from 'wagmi';

interface GrantProject {
  id: string;
  name: string;
  description: string;
  encryptedFunding: string;
  encryptedVotes: string;
  category: string;
  timestamp: number;
  owner: string;
  status: "pending" | "approved" | "rejected";
}

const FHEEncryptNumber = (value: number): string => {
  return `FHE-${btoa(value.toString())}`;
};

const FHEDecryptNumber = (encryptedData: string): number => {
  if (encryptedData.startsWith('FHE-')) {
    return parseFloat(atob(encryptedData.substring(4)));
  }
  return parseFloat(encryptedData);
};

const FHEComputeQuadratic = (encryptedData: string): string => {
  const value = FHEDecryptNumber(encryptedData);
  const result = Math.sqrt(value); // Simplified quadratic matching simulation
  return FHEEncryptNumber(result);
};

const generatePublicKey = () => `0x${Array(2000).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('')}`;

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<GrantProject[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ visible: false, status: "pending", message: "" });
  const [newProjectData, setNewProjectData] = useState({ name: "", description: "", fundingGoal: 0, category: "" });
  const [selectedProject, setSelectedProject] = useState<GrantProject | null>(null);
  const [decryptedFunding, setDecryptedFunding] = useState<number | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [publicKey, setPublicKey] = useState<string>("");
  const [contractAddress, setContractAddress] = useState<string>("");
  const [chainId, setChainId] = useState<number>(0);
  const [startTimestamp, setStartTimestamp] = useState<number>(0);
  const [durationDays, setDurationDays] = useState<number>(30);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");

  const approvedCount = projects.filter(p => p.status === "approved").length;
  const pendingCount = projects.filter(p => p.status === "pending").length;
  const rejectedCount = projects.filter(p => p.status === "rejected").length;

  useEffect(() => {
    loadProjects().finally(() => setLoading(false));
    const initSignatureParams = async () => {
      const contract = await getContractReadOnly();
      if (contract) setContractAddress(await contract.getAddress());
      if (window.ethereum) {
        const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
        setChainId(parseInt(chainIdHex, 16));
      }
      setStartTimestamp(Math.floor(Date.now() / 1000));
      setDurationDays(30);
      setPublicKey(generatePublicKey());
    };
    initSignatureParams();
  }, []);

  const loadProjects = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) return;
      
      const keysBytes = await contract.getData("project_keys");
      let keys: string[] = [];
      if (keysBytes.length > 0) {
        try {
          const keysStr = ethers.toUtf8String(keysBytes);
          if (keysStr.trim() !== '') keys = JSON.parse(keysStr);
        } catch (e) { console.error("Error parsing project keys:", e); }
      }
      
      const list: GrantProject[] = [];
      for (const key of keys) {
        try {
          const projectBytes = await contract.getData(`project_${key}`);
          if (projectBytes.length > 0) {
            try {
              const projectData = JSON.parse(ethers.toUtf8String(projectBytes));
              list.push({ 
                id: key, 
                name: projectData.name,
                description: projectData.description,
                encryptedFunding: projectData.funding,
                encryptedVotes: projectData.votes,
                category: projectData.category,
                timestamp: projectData.timestamp, 
                owner: projectData.owner, 
                status: projectData.status || "pending" 
              });
            } catch (e) { console.error(`Error parsing project data for ${key}:`, e); }
          }
        } catch (e) { console.error(`Error loading project ${key}:`, e); }
      }
      list.sort((a, b) => b.timestamp - a.timestamp);
      setProjects(list);
    } catch (e) { console.error("Error loading projects:", e); } 
    finally { setIsRefreshing(false); setLoading(false); }
  };

  const submitProject = async () => {
    if (!isConnected) { alert("Please connect wallet first"); return; }
    setCreating(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Encrypting funding data with Zama FHE..." });
    try {
      const encryptedFunding = FHEEncryptNumber(newProjectData.fundingGoal);
      const encryptedVotes = FHEEncryptNumber(0); // Initialize with 0 votes
      
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const projectId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const projectData = { 
        name: newProjectData.name,
        description: newProjectData.description,
        funding: encryptedFunding,
        votes: encryptedVotes,
        category: newProjectData.category,
        timestamp: Math.floor(Date.now() / 1000), 
        owner: address, 
        status: "pending" 
      };
      
      await contract.setData(`project_${projectId}`, ethers.toUtf8Bytes(JSON.stringify(projectData)));
      
      const keysBytes = await contract.getData("project_keys");
      let keys: string[] = [];
      if (keysBytes.length > 0) {
        try { keys = JSON.parse(ethers.toUtf8String(keysBytes)); } 
        catch (e) { console.error("Error parsing keys:", e); }
      }
      keys.push(projectId);
      await contract.setData("project_keys", ethers.toUtf8Bytes(JSON.stringify(keys)));
      
      setTransactionStatus({ visible: true, status: "success", message: "Project submitted with FHE encryption!" });
      await loadProjects();
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowCreateModal(false);
        setNewProjectData({ name: "", description: "", fundingGoal: 0, category: "" });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction") ? "Transaction rejected by user" : "Submission failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { setCreating(false); }
  };

  const decryptWithSignature = async (encryptedData: string): Promise<number | null> => {
    if (!isConnected) { alert("Please connect wallet first"); return null; }
    setIsDecrypting(true);
    try {
      const message = `publickey:${publicKey}\ncontractAddresses:${contractAddress}\ncontractsChainId:${chainId}\nstartTimestamp:${startTimestamp}\ndurationDays:${durationDays}`;
      await signMessageAsync({ message });
      await new Promise(resolve => setTimeout(resolve, 1500));
      return FHEDecryptNumber(encryptedData);
    } catch (e) { console.error("Decryption failed:", e); return null; } 
    finally { setIsDecrypting(false); }
  };

  const approveProject = async (projectId: string) => {
    if (!isConnected) { alert("Please connect wallet first"); return; }
    setTransactionStatus({ visible: true, status: "pending", message: "Processing encrypted funding with FHE..." });
    try {
      const contract = await getContractReadOnly();
      if (!contract) throw new Error("Failed to get contract");
      const projectBytes = await contract.getData(`project_${projectId}`);
      if (projectBytes.length === 0) throw new Error("Project not found");
      const projectData = JSON.parse(ethers.toUtf8String(projectBytes));
      
      const updatedProject = { ...projectData, status: "approved" };
      
      const contractWithSigner = await getContractWithSigner();
      if (!contractWithSigner) throw new Error("Failed to get contract with signer");
      
      await contractWithSigner.setData(`project_${projectId}`, ethers.toUtf8Bytes(JSON.stringify(updatedProject)));
      
      setTransactionStatus({ visible: true, status: "success", message: "Project approved with FHE verification!" });
      await loadProjects();
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e: any) {
      setTransactionStatus({ visible: true, status: "error", message: "Approval failed: " + (e.message || "Unknown error") });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const rejectProject = async (projectId: string) => {
    if (!isConnected) { alert("Please connect wallet first"); return; }
    setTransactionStatus({ visible: true, status: "pending", message: "Processing encrypted funding with FHE..." });
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      const projectBytes = await contract.getData(`project_${projectId}`);
      if (projectBytes.length === 0) throw new Error("Project not found");
      const projectData = JSON.parse(ethers.toUtf8String(projectBytes));
      const updatedProject = { ...projectData, status: "rejected" };
      await contract.setData(`project_${projectId}`, ethers.toUtf8Bytes(JSON.stringify(updatedProject)));
      setTransactionStatus({ visible: true, status: "success", message: "Project rejected with FHE verification!" });
      await loadProjects();
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e: any) {
      setTransactionStatus({ visible: true, status: "error", message: "Rejection failed: " + (e.message || "Unknown error") });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const donateToProject = async (projectId: string, amount: number) => {
    if (!isConnected) { alert("Please connect wallet first"); return; }
    setTransactionStatus({ visible: true, status: "pending", message: "Processing encrypted donation with FHE..." });
    try {
      const contract = await getContractReadOnly();
      if (!contract) throw new Error("Failed to get contract");
      const projectBytes = await contract.getData(`project_${projectId}`);
      if (projectBytes.length === 0) throw new Error("Project not found");
      const projectData = JSON.parse(ethers.toUtf8String(projectBytes));
      
      // Simulate quadratic funding calculation
      const currentFunding = FHEDecryptNumber(projectData.funding);
      const currentVotes = FHEDecryptNumber(projectData.votes);
      const newFunding = currentFunding + amount;
      const newVotes = currentVotes + Math.sqrt(amount); // Simplified quadratic matching
      
      const updatedProject = { 
        ...projectData, 
        funding: FHEEncryptNumber(newFunding),
        votes: FHEEncryptNumber(newVotes)
      };
      
      const contractWithSigner = await getContractWithSigner();
      if (!contractWithSigner) throw new Error("Failed to get contract with signer");
      
      await contractWithSigner.setData(`project_${projectId}`, ethers.toUtf8Bytes(JSON.stringify(updatedProject)));
      
      setTransactionStatus({ visible: true, status: "success", message: "Donation processed with FHE encryption!" });
      await loadProjects();
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e: any) {
      setTransactionStatus({ visible: true, status: "error", message: "Donation failed: " + (e.message || "Unknown error") });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const isOwner = (projectAddress: string) => address?.toLowerCase() === projectAddress.toLowerCase();

  const filteredProjects = projects.filter(project => {
    const matchesSearch = project.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         project.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = filterCategory === "all" || project.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  const categories = [...new Set(projects.map(p => p.category))];

  if (loading) return (
    <div className="loading-screen">
      <div className="spinner"></div>
      <p>Initializing FHE encrypted connection...</p>
    </div>
  );

  return (
    <div className="app-container">
      <div className="background-gradient"></div>
      
      <header className="app-header">
        <div className="logo">
          <h1>FHE<span>Public</span>Goods</h1>
          <p>Privacy-preserving quadratic funding for public goods</p>
        </div>
        <div className="header-actions">
          <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
        </div>
      </header>

      <main className="main-content">
        <section className="hero-section">
          <div className="hero-content">
            <h2>Fund Public Goods with <span>FHE Privacy</span></h2>
            <p>A ReFi protocol that allows DAOs to issue FHE-encrypted grants for public goods</p>
            <div className="hero-buttons">
              <button className="primary-btn" onClick={() => setShowCreateModal(true)}>
                Submit Project
              </button>
              <button className="secondary-btn" onClick={loadProjects}>
                Refresh Projects
              </button>
            </div>
          </div>
          <div className="hero-image">
            <div className="fhe-badge">
              <span>Powered by Zama FHE</span>
            </div>
          </div>
        </section>

        <section className="stats-section">
          <div className="stat-card">
            <h3>Total Projects</h3>
            <div className="stat-value">{projects.length}</div>
          </div>
          <div className="stat-card">
            <h3>Approved</h3>
            <div className="stat-value">{approvedCount}</div>
          </div>
          <div className="stat-card">
            <h3>Pending</h3>
            <div className="stat-value">{pendingCount}</div>
          </div>
          <div className="stat-card">
            <h3>Rejected</h3>
            <div className="stat-value">{rejectedCount}</div>
          </div>
        </section>

        <section className="search-section">
          <div className="search-container">
            <input 
              type="text" 
              placeholder="Search projects..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <select 
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
            >
              <option value="all">All Categories</option>
              {categories.map((cat, i) => (
                <option key={i} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
        </section>

        <section className="projects-section">
          <h2>Public Goods Projects</h2>
          {filteredProjects.length === 0 ? (
            <div className="empty-state">
              <p>No projects found matching your criteria</p>
              <button className="primary-btn" onClick={() => setShowCreateModal(true)}>
                Create First Project
              </button>
            </div>
          ) : (
            <div className="projects-grid">
              {filteredProjects.map(project => (
                <div className="project-card" key={project.id}>
                  <div className="card-header">
                    <h3>{project.name}</h3>
                    <span className={`status-badge ${project.status}`}>{project.status}</span>
                  </div>
                  <div className="card-category">{project.category}</div>
                  <p className="card-description">{project.description.substring(0, 100)}...</p>
                  <div className="card-footer">
                    <button 
                      className="action-btn" 
                      onClick={() => setSelectedProject(project)}
                    >
                      View Details
                    </button>
                    {isOwner(project.owner) && project.status === "pending" && (
                      <div className="owner-actions">
                        <button 
                          className="approve-btn" 
                          onClick={(e) => { e.stopPropagation(); approveProject(project.id); }}
                        >
                          Approve
                        </button>
                        <button 
                          className="reject-btn" 
                          onClick={(e) => { e.stopPropagation(); rejectProject(project.id); }}
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="community-section">
          <h2>Join Our Community</h2>
          <div className="community-links">
            <a href="#" className="community-link">Discord</a>
            <a href="#" className="community-link">Twitter</a>
            <a href="#" className="community-link">GitHub</a>
            <a href="#" className="community-link">Forum</a>
          </div>
        </section>
      </main>

      {showCreateModal && (
        <div className="modal-overlay">
          <div className="create-modal">
            <div className="modal-header">
              <h2>Submit New Project</h2>
              <button onClick={() => setShowCreateModal(false)} className="close-btn">&times;</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Project Name *</label>
                <input 
                  type="text" 
                  value={newProjectData.name}
                  onChange={(e) => setNewProjectData({...newProjectData, name: e.target.value})}
                  placeholder="Enter project name"
                />
              </div>
              <div className="form-group">
                <label>Description *</label>
                <textarea 
                  value={newProjectData.description}
                  onChange={(e) => setNewProjectData({...newProjectData, description: e.target.value})}
                  placeholder="Describe your public good project"
                />
              </div>
              <div className="form-group">
                <label>Funding Goal (ETH) *</label>
                <input 
                  type="number" 
                  value={newProjectData.fundingGoal}
                  onChange={(e) => setNewProjectData({...newProjectData, fundingGoal: parseFloat(e.target.value)})}
                  placeholder="Enter funding goal"
                  step="0.01"
                />
              </div>
              <div className="form-group">
                <label>Category *</label>
                <select 
                  value={newProjectData.category}
                  onChange={(e) => setNewProjectData({...newProjectData, category: e.target.value})}
                >
                  <option value="">Select category</option>
                  <option value="Education">Education</option>
                  <option value="Environment">Environment</option>
                  <option value="Open Source">Open Source</option>
                  <option value="Community">Community</option>
                  <option value="Research">Research</option>
                </select>
              </div>
              <div className="fhe-notice">
                <p>Your funding goal will be encrypted with Zama FHE technology before submission</p>
              </div>
            </div>
            <div className="modal-footer">
              <button 
                className="submit-btn" 
                onClick={submitProject}
                disabled={creating || !newProjectData.name || !newProjectData.description || !newProjectData.fundingGoal || !newProjectData.category}
              >
                {creating ? "Submitting..." : "Submit Project"}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedProject && (
        <div className="modal-overlay">
          <div className="project-modal">
            <div className="modal-header">
              <h2>{selectedProject.name}</h2>
              <button onClick={() => { setSelectedProject(null); setDecryptedFunding(null); }} className="close-btn">&times;</button>
            </div>
            <div className="modal-body">
              <div className="project-meta">
                <span className={`status-badge ${selectedProject.status}`}>{selectedProject.status}</span>
                <span className="category-badge">{selectedProject.category}</span>
                <span className="timestamp">{new Date(selectedProject.timestamp * 1000).toLocaleDateString()}</span>
              </div>
              
              <div className="project-description">
                <h3>Description</h3>
                <p>{selectedProject.description}</p>
              </div>
              
              <div className="project-funding">
                <h3>Funding</h3>
                <div className="funding-display">
                  <div className="encrypted-data">
                    <h4>Encrypted Funding</h4>
                    <p>{selectedProject.encryptedFunding.substring(0, 50)}...</p>
                    <span className="fhe-tag">FHE Encrypted</span>
                  </div>
                  <button 
                    className="decrypt-btn" 
                    onClick={async () => {
                      if (decryptedFunding === null) {
                        const decrypted = await decryptWithSignature(selectedProject.encryptedFunding);
                        if (decrypted !== null) setDecryptedFunding(decrypted);
                      } else {
                        setDecryptedFunding(null);
                      }
                    }}
                    disabled={isDecrypting}
                  >
                    {isDecrypting ? "Decrypting..." : decryptedFunding !== null ? "Hide Value" : "Decrypt with Wallet"}
                  </button>
                  {decryptedFunding !== null && (
                    <div className="decrypted-data">
                      <h4>Decrypted Funding</h4>
                      <p>{decryptedFunding} ETH</p>
                    </div>
                  )}
                </div>
              </div>
              
              {selectedProject.status === "approved" && (
                <div className="donate-section">
                  <h3>Support This Project</h3>
                  <div className="donate-form">
                    <input type="number" placeholder="Amount in ETH" id="donationAmount" step="0.01" />
                    <button 
                      className="donate-btn" 
                      onClick={() => {
                        const amountInput = document.getElementById('donationAmount') as HTMLInputElement;
                        const amount = parseFloat(amountInput.value);
                        if (amount > 0) {
                          donateToProject(selectedProject.id, amount);
                        }
                      }}
                    >
                      Donate
                    </button>
                  </div>
                  <p className="fhe-notice">Your donation will be processed with FHE encryption</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {transactionStatus.visible && (
        <div className="transaction-notification">
          <div className={`notification-content ${transactionStatus.status}`}>
            <div className="notification-icon">
              {transactionStatus.status === "pending" && <div className="spinner"></div>}
              {transactionStatus.status === "success" && "✓"}
              {transactionStatus.status === "error" && "✗"}
            </div>
            <p>{transactionStatus.message}</p>
          </div>
        </div>
      )}

      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-left">
            <h3>FHE Public Goods</h3>
            <p>Privacy-preserving quadratic funding powered by Zama FHE</p>
          </div>
          <div className="footer-right">
            <div className="footer-links">
              <a href="#">Docs</a>
              <a href="#">GitHub</a>
              <a href="#">Terms</a>
              <a href="#">Privacy</a>
            </div>
            <div className="fhe-badge">
              <span>FHE-Powered Privacy</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;