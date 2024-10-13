// Importa le funzioni necessarie da Firebase Firestore
import { collection, doc, setDoc, getDoc, onSnapshot, addDoc, updateDoc } from "https://www.gstatic.com/firebasejs/9.12.0/firebase-firestore.js";

// Ottieni i riferimenti a Firestore e agli elementi HTML
const db = window.db;
const startButton = document.getElementById('startBtn');
const joinButton = document.getElementById('joinBtn');
const remoteAudio = document.getElementById('remoteAudio');
const roomIdDisplay = document.getElementById('roomId');

let peerConnection;
let localStream;
let roomRef;
let roomId;

// Configurazione server STUN
const config = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

// Funzione per creare una stanza
async function createRoom() {
    try {
        // Crea un documento Firestore per la stanza
        roomRef = doc(collection(db, 'rooms'));
        roomId = roomRef.id;
        console.log(`ID della stanza: ${roomId}`);

        // Mostra l'ID della stanza nell'HTML
        roomIdDisplay.textContent = roomId;

        // Crea la connessione peer-to-peer
        peerConnection = new RTCPeerConnection(config);

        // Ottieni l'audio locale dal microfono
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

        // Aggiungi i candidati ICE locali a Firestore
        peerConnection.onicecandidate = event => {
            if (event.candidate) {
                addDoc(collection(roomRef, 'candidates'), event.candidate.toJSON());
            }
        };

        // Ascolta lo stream remoto
        peerConnection.ontrack = event => {
            remoteAudio.srcObject = event.streams[0]; // Riproduci solo l'audio remoto
        };

        // Crea un'offerta WebRTC
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);

        // Salva l'offerta su Firestore (sdp e type separati)
        await setDoc(roomRef, { 
            offer: { sdp: offer.sdp, type: offer.type } 
        });

        // Ascolta la risposta su Firestore
        onSnapshot(roomRef, async (snapshot) => {
            const data = snapshot.data();
            if (!peerConnection.currentRemoteDescription && data?.answer) {
                const answer = new RTCSessionDescription({
                    sdp: data.answer.sdp,
                    type: data.answer.type
                });
                await peerConnection.setRemoteDescription(answer);
            }
        });

        // Ascolta i candidati ICE remoti su Firestore
        onSnapshot(collection(roomRef, 'candidates'), (snapshot) => {
            snapshot.docChanges().forEach(async change => {
                if (change.type === 'added') {
                    const candidate = new RTCIceCandidate(change.doc.data());
                    await peerConnection.addIceCandidate(candidate);
                }
            });
        });

        console.log('Stanza creata con successo!');
    } catch (error) {
        console.error('Errore nella creazione della stanza:', error);
    }
}

// Funzione per unirsi a una stanza esistente
async function joinRoom() {
    try {
        const roomIdInput = prompt("Inserisci l'ID della stanza:");
        roomRef = doc(db, 'rooms', roomIdInput);
        const roomSnapshot = await getDoc(roomRef);

        if (roomSnapshot.exists()) {
            peerConnection = new RTCPeerConnection(config);

            // Ottieni l'audio locale
            localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

            // Aggiungi i candidati ICE locali a Firestore
            peerConnection.onicecandidate = event => {
                if (event.candidate) {
                    addDoc(collection(roomRef, 'candidates'), event.candidate.toJSON());
                }
            };

            // Ascolta lo stream remoto
            peerConnection.ontrack = event => {
                remoteAudio.srcObject = event.streams[0]; // Riproduci solo l'audio remoto
            };

            // Ottieni l'offerta dal peer remoto e imposta la descrizione locale
            const offer = roomSnapshot.data().offer; // Accedi all'offerta
            await peerConnection.setRemoteDescription(new RTCSessionDescription({
                sdp: offer.sdp,
                type: offer.type
            }));

            // Crea una risposta e inviala su Firestore (sdp e type separati)
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);

            // Aggiorna la risposta nel Firestore
            await updateDoc(roomRef, { 
                answer: { sdp: answer.sdp, type: answer.type } 
            }); 

            // Ascolta i candidati ICE remoti
            onSnapshot(collection(roomRef, 'candidates'), (snapshot) => {
                snapshot.docChanges().forEach(async change => {
                    if (change.type === 'added') {
                        const candidate = new RTCIceCandidate(change.doc.data());
                        await peerConnection.addIceCandidate(candidate);
                    }
                });
            });

            console.log('Connessione stabilita con successo!');
        } else {
            alert("La stanza non esiste.");
        }
    } catch (error) {
        console.error('Errore durante il tentativo di connessione alla stanza:', error);
    }
}

// Eventi per i pulsanti
startButton.addEventListener('click', createRoom);
joinButton.addEventListener('click', joinRoom);
