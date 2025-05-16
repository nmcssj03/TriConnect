document.addEventListener('DOMContentLoaded', function() {
    // Game constants
    let BOARD_WIDTH = 700; // SVG width
    let BOARD_HEIGHT = 600; // SVG height
    let LAYERS = 6;
    const NODE_RADIUS = 6;
    let HORIZONTAL_SPACING = (BOARD_WIDTH - 100) / (LAYERS -1); // Adjusted for padding
    let VERTICAL_SPACING = (BOARD_HEIGHT - 100) / (LAYERS -1);   // Adjusted for padding
    const SVG_PADDING = 50; // Padding around the pyramid

    // AI Constants
    const AI_PLAYER = 2;
    const HUMAN_PLAYER = 1;
    const AI_MAX_DEPTH = 3; // Adjust for better performance
    
    // New: Transposition table for caching evaluated positions
    const transpositionTable = new Map();
    const CACHE_SIZE_LIMIT = 1000000; // Limit cache size to prevent memory issues
    const CACHE_CLEANUP_THRESHOLD = 800000; // Threshold for cleanup

    // Game state
    let currentPlayer = HUMAN_PLAYER;
    let scores = [0, 0]; // scores[0] for Player 1, scores[1] for Player 2 (AI)
    let selectedLines = []; // Array of booleans, true if line at index is selected
    let lines = []; // Array of line objects {id, node1, node2, type, selected, player}
    let triangles = []; // Array of triangle objects {id, nodes, lines, completed, player, orientation}
    let gameFinished = false;
    let nodes = []; // Store nodes globally for easier access

    // SVG element
    const svg = document.getElementById('board-svg');
    svg.setAttribute('width', BOARD_WIDTH);
    svg.setAttribute('height', BOARD_HEIGHT);


    // --- UTILITY FUNCTIONS ---
    function deepCopy(obj) {
        return JSON.parse(JSON.stringify(obj));
    }

    function shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }

    // Calculate node positions for the pyramid
    function calculateNodePositions() {
        const localNodes = [];
        let totalNodes = 0;
        for (let layer = 0; layer < LAYERS; layer++) { // layer index from 0 to LAYERS-1
            const numNodesInLayer = layer + 1;
            const layerWidth = layer * HORIZONTAL_SPACING;
            const startX = (BOARD_WIDTH - layerWidth) / 2;
            
            for (let i = 0; i < numNodesInLayer; i++) {
                const x = startX + i * HORIZONTAL_SPACING;
                const y = SVG_PADDING + layer * VERTICAL_SPACING;
                localNodes.push({
                    id: totalNodes++,
                    x,
                    y,
                    layer // Store layer index
                });
            }
        }
        return localNodes;
    }

    // Generate all possible lines that connect nodes
    function generateLines(nodesToUse) {
        const localLines = [];
        let lineId = 0;

        function findNodeByCoords(x, y, layer) {
            return nodesToUse.find(node => node.layer === layer && Math.abs(node.x - x) < 0.1 && Math.abs(node.y - y) < 0.1);
        }

        for (let layer = 0; layer < LAYERS; layer++) {
            const currentLayerNodes = nodesToUse.filter(node => node.layer === layer);
            // Horizontal lines
            for (let i = 0; i < currentLayerNodes.length - 1; i++) {
                localLines.push({
                    id: lineId++,
                    node1: currentLayerNodes[i].id,
                    node2: currentLayerNodes[i + 1].id,
                    selected: false, // Initially not selected
                    player: null     // No player initially
                });
            }

            // Diagonal lines to the next layer
            if (layer < LAYERS - 1) {
                const nextLayerNodes = nodesToUse.filter(node => node.layer === layer + 1);
                for (let i = 0; i < currentLayerNodes.length; i++) {
                    const currentNode = currentLayerNodes[i];
                    // Find corresponding nodes in the next layer for diagonals
                    // Node directly below and to the right (for downward pointing triangle component)
                    const rightDiagonalNode = nextLayerNodes.find(n => Math.abs(n.x - (currentNode.x + HORIZONTAL_SPACING / 2)) < 0.1 && Math.abs(n.y - (currentNode.y + VERTICAL_SPACING)) < 0.1);
                    if (rightDiagonalNode) {
                        localLines.push({ id: lineId++, node1: currentNode.id, node2: rightDiagonalNode.id, selected: false, player: null });
                    }
                    // Node directly below and to the left (for downward pointing triangle component)
                    const leftDiagonalNode = nextLayerNodes.find(n => Math.abs(n.x - (currentNode.x - HORIZONTAL_SPACING / 2)) < 0.1 && Math.abs(n.y - (currentNode.y + VERTICAL_SPACING)) < 0.1);
                    if (leftDiagonalNode) {
                        localLines.push({ id: lineId++, node1: currentNode.id, node2: leftDiagonalNode.id, selected: false, player: null });
                    }
                }
            }
        }
        return localLines;
    }
    
    // Generate all possible smallest unit triangles in the board
    function generateTriangles(nodesToUse, linesToUse) {
        const localTriangles = [];
        let triangleIdCounter = 0;

        function findLine(node1Id, node2Id) {
            return linesToUse.find(line =>
                ((line.node1 === node1Id && line.node2 === node2Id) ||
                (line.node1 === node2Id && line.node2 === node1Id))
            );
        }

        for (let i = 0; i < nodesToUse.length; i++) {
            for (let j = i + 1; j < nodesToUse.length; j++) {
                for (let k = j + 1; k < nodesToUse.length; k++) {
                    const n1 = nodesToUse[i];
                    const n2 = nodesToUse[j];
                    const n3 = nodesToUse[k];

                    const line1 = findLine(n1.id, n2.id);
                    const line2 = findLine(n2.id, n3.id);
                    const line3 = findLine(n3.id, n1.id);

                    if (line1 && line2 && line3) {
                        // Check if it's a "minimal" triangle (area check or specific formation)
                        // A simple check for minimal triangles:
                        // Two nodes are in one layer, one is in an adjacent layer.
                        const layers = [n1.layer, n2.layer, n3.layer].sort((a,b)=>a-b);
                        const isMinimal = (layers[0] === layers[1] && layers[2] === layers[1] + 1) ||
                                        (layers[1] === layers[2] && layers[0] === layers[1] - 1);

                        if (isMinimal) {
                            const triangleNodeIds = [n1.id, n2.id, n3.id].sort((a, b) => a - b);
                            // Ensure this triangle (by nodes) isn't already added
                            const alreadyExists = localTriangles.some(t =>
                                t.nodes.length === 3 &&
                                t.nodes.every(nodeId => triangleNodeIds.includes(nodeId)) &&
                                triangleNodeIds.every(nodeId => t.nodes.includes(nodeId))
                            );

                            if (!alreadyExists) {
                                localTriangles.push({
                                    id: triangleIdCounter++,
                                    nodes: triangleNodeIds,
                                    lines: [line1.id, line2.id, line3.id].sort((a, b) => a - b),
                                    completed: false,
                                    player: null,
                                    // Orientation can be determined if needed for visuals, e.g. based on y-coords
                                    // For now, not strictly necessary for logic
                                    orientation: (n1.y === n2.y || n1.y === n3.y || n2.y === n3.y) ? 'base_horizontal' : 'base_diagonal'
                                });
                            }
                        }
                    }
                }
            }
        }
        return localTriangles;
    }

    // Initialize the game board
    function initializeBoard() {
        // Update LAYERS based on board size selection
        LAYERS = parseInt(document.getElementById('boardSize').value);
        HORIZONTAL_SPACING = (BOARD_WIDTH - 100) / (LAYERS - 1);
        VERTICAL_SPACING = (BOARD_HEIGHT - 100) / (LAYERS - 1);

        svg.innerHTML = ''; // Clear the SVG

        nodes = calculateNodePositions();
        lines = generateLines(nodes);
        triangles = generateTriangles(nodes, lines);
        
        selectedLines = new Array(lines.length).fill(false);
        
        // Create triangle elements (visual representation, behind lines)
        const triangleGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        triangleGroup.setAttribute('class', 'triangles');
        triangles.forEach(triangle => {
            const n1 = nodes[triangle.nodes[0]];
            const n2 = nodes[triangle.nodes[1]];
            const n3 = nodes[triangle.nodes[2]];
            const triangleElement = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
            triangleElement.setAttribute('points', `${n1.x},${n1.y} ${n2.x},${n2.y} ${n3.x},${n3.y}`);
            triangleElement.setAttribute('class', 'triangle');
            triangleElement.setAttribute('id', `triangle-${triangle.id}`);
            triangleElement.setAttribute('opacity', '0'); // Initially invisible
            triangleGroup.appendChild(triangleElement);
        });
        svg.appendChild(triangleGroup);

        // Create line elements
        const lineGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        lineGroup.setAttribute('class', 'lines');
        lines.forEach(line => {
            const n1 = nodes[line.node1];
            const n2 = nodes[line.node2];
            const lineElement = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            lineElement.setAttribute('x1', n1.x);
            lineElement.setAttribute('y1', n1.y);
            lineElement.setAttribute('x2', n2.x);
            lineElement.setAttribute('y2', n2.y);
            lineElement.setAttribute('class', 'line');
            lineElement.setAttribute('id', `line-${line.id}`);
            lineElement.addEventListener('click', () => handleLineClick(line.id));
            lineGroup.appendChild(lineElement);
        });
        svg.appendChild(lineGroup);

        // Create node elements (on top of lines)
        const nodeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        nodeGroup.setAttribute('class', 'nodes');
        nodes.forEach(node => {
            const nodeElement = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            nodeElement.setAttribute('cx', node.x);
            nodeElement.setAttribute('cy', node.y);
            nodeElement.setAttribute('r', NODE_RADIUS);
            nodeElement.setAttribute('class', 'node');
            nodeElement.setAttribute('id', `node-${node.id}`);
            nodeGroup.appendChild(nodeElement);
        });
        svg.appendChild(nodeGroup);

        // Reset game state
        document.getElementById('boardSizeValue').textContent = LAYERS;
        const firstPlayerRadios = document.getElementsByName('firstPlayer');
        currentPlayer = parseInt([...firstPlayerRadios].find(radio => radio.checked).value);
        scores = [0, 0];
        gameFinished = false;
        document.getElementById('ai-status').textContent = '';

        updateScoreDisplay();
        updatePlayerTurn();
        document.getElementById('game-over').style.display = 'none';
        enableBoardInteraction();

        // If AI is first, trigger its move
        if (currentPlayer === AI_PLAYER) {
            setTimeout(aiMakeMove, 500);
        }
    }

    // Handle human player line click event
    function handleLineClick(lineId) {
        if (gameFinished || selectedLines[lineId] || currentPlayer !== HUMAN_PLAYER) {
            return;
        }

        selectedLines[lineId] = true;
        lines.find(l => l.id === lineId).selected = true; // Update master lines array too
        lines.find(l => l.id === lineId).player = HUMAN_PLAYER;


        const lineElement = document.getElementById(`line-${lineId}`);
        lineElement.classList.add('selected', `player-${HUMAN_PLAYER}`);

        let triangleCompletedThisTurn = checkAndProcessCompletedTriangles(HUMAN_PLAYER);
        updateScoreDisplay();

        if (triangles.every(triangle => triangle.completed)) {
            gameFinished = true;
            showGameOver();
            return;
        }

        if (!triangleCompletedThisTurn) {
            switchPlayer();
            // AI's turn will be triggered by switchPlayer if it's AI's turn next
        } else {
            updatePlayerTurn(); // Human scored, human plays again. Update display.
        }
    }
    
    // Checks for completed triangles, updates scores and UI
    // Returns true if any triangle was completed by the specified player
    function checkAndProcessCompletedTriangles(player) {
        let anyTriangleCompleted = false;
        triangles.forEach(triangle => {
            if (!triangle.completed && triangle.lines.every(l_id => selectedLines[l_id])) {
                triangle.completed = true;
                triangle.player = player;
                scores[player - 1]++;
                anyTriangleCompleted = true;

                const triangleElement = document.getElementById(`triangle-${triangle.id}`);
                triangleElement.classList.add(`player-${player}`);
                triangleElement.setAttribute('opacity', '0.5'); // Make triangle visible
            }
        });
        return anyTriangleCompleted;
    }


    // Switch to the next player
    function switchPlayer() {
        currentPlayer = (currentPlayer === HUMAN_PLAYER) ? AI_PLAYER : HUMAN_PLAYER;
        updatePlayerTurn();
        if (currentPlayer === AI_PLAYER && !gameFinished) {
            // Delay AI move slightly for better UX
            setTimeout(aiMakeMove, 500);
        }
    }

    function updateScoreDisplay() {
        document.getElementById('score1').textContent = scores[0];
        document.getElementById('score2').textContent = scores[1];
    }

    function updatePlayerTurn() {
        document.getElementById('player1').classList.toggle('active', currentPlayer === HUMAN_PLAYER);
        document.getElementById('player2').classList.toggle('active', currentPlayer === AI_PLAYER);
        if (currentPlayer === AI_PLAYER && !gameFinished) {
            document.getElementById('ai-status').textContent = "AI is thinking...";
        } else if (currentPlayer === HUMAN_PLAYER && !gameFinished) {
            document.getElementById('ai-status').textContent = "Your turn";
        } else if (gameFinished) {
            document.getElementById('ai-status').textContent = "Game Over!";
        }
    }
    
    function showGameOver() {
        const gameOverElement = document.getElementById('game-over');
        const winnerTextElement = document.getElementById('winner-text');
        enableBoardInteraction(); // Ensure board is interactive for new game
        document.getElementById('ai-status').textContent = "Game Over!";

        if (scores[0] > scores[1]) {
            winnerTextElement.innerHTML = '<span class="player-1-text"> You </span> win!';
        } else if (scores[1] > scores[0]) {
            winnerTextElement.innerHTML = '<span class="player-2-text">TriCon AI</span> wins!';
        } else {
            winnerTextElement.textContent = 'It\'s a tie!';
        }
        gameOverElement.style.display = 'block';
    }

    function disableBoardInteraction() {
        svg.style.pointerEvents = 'none';
    }
    function enableBoardInteraction() {
        svg.style.pointerEvents = 'auto';
    }

    // --- AI LOGIC ---
    async function aiMakeMove() {
        if (gameFinished || currentPlayer !== AI_PLAYER) return;

        disableBoardInteraction();
        updatePlayerTurn(); // Shows "AI is thinking..."

        // Use a short timeout to allow UI to update before blocking for minimax
        await new Promise(resolve => setTimeout(resolve, 100));

        let aiTurnContinues = true;
        while (aiTurnContinues && !gameFinished && currentPlayer === AI_PLAYER) {
            const bestMoveInfo = findBestMoveAI(deepCopy(selectedLines), deepCopy(triangles), deepCopy(scores));

            if (bestMoveInfo.lineId === null || bestMoveInfo.lineId === undefined) {
                // No valid moves left for AI (should not happen if game isn't over and lines available)
                aiTurnContinues = false;
                if (!gameFinished) switchPlayer(); // Pass turn if AI can't move
                break;
            }

            // Apply AI's chosen move to the global state
            selectedLines[bestMoveInfo.lineId] = true;
            lines.find(l => l.id === bestMoveInfo.lineId).selected = true;
            lines.find(l => l.id === bestMoveInfo.lineId).player = AI_PLAYER;


            const lineElement = document.getElementById(`line-${bestMoveInfo.lineId}`);
            if (lineElement) {
                lineElement.classList.add('selected', `player-${AI_PLAYER}`);
            }

            let triangleCompletedByAI = checkAndProcessCompletedTriangles(AI_PLAYER);
            updateScoreDisplay();
            
            const allTrianglesNowCompleted = triangles.every(triangle => triangle.completed);

            if (allTrianglesNowCompleted) {
                gameFinished = true;
                showGameOver();
                aiTurnContinues = false;
            } else if (!triangleCompletedByAI) {
                aiTurnContinues = false;
                switchPlayer(); // Switch to Human
            } else {
                // AI completed a triangle and game is not over, AI gets another turn
                updatePlayerTurn(); // Keep it on AI, update "AI is thinking..."
                if (!gameFinished) {
                    await new Promise(resolve => setTimeout(resolve, 500)); // Delay for visibility
                }
            }
        }
        if (!gameFinished) { // If loop ended but game not over (e.g. AI passed)
            enableBoardInteraction();
            updatePlayerTurn(); // Update status if AI turn ended without game over
        } else {
            enableBoardInteraction(); // Ensure board is enabled if game ended
        }
    }

    function getAvailableLineMoves(currentSelectedLines) {
        const available = [];
        for (let i = 0; i < currentSelectedLines.length; i++) {
            if (!currentSelectedLines[i]) {
                available.push(i);
            }
        }
        return available;
    }
    
    // Simulates applying a move and returns the new state and outcome.
    // Operates on COPIES of states.
    function simulateApplyMove(lineId, player, linesCopy, trianglesCopy, scoresCopy) {
        let newSelectedLines = deepCopy(linesCopy);
        let newTriangles = deepCopy(trianglesCopy); // trianglesCopy should be a deep copy of global triangles structure
        let newScores = deepCopy(scoresCopy);

        newSelectedLines[lineId] = true;

        let triangleCompletedThisTurn = false;
        newTriangles.forEach(triangle => {
            if (!triangle.completed) {
                if (triangle.lines.every(l_id => newSelectedLines[l_id])) {
                    triangle.completed = true;
                    triangle.player = player;
                    newScores[player - 1]++;
                    triangleCompletedThisTurn = true;
                }
            }
        });

        const nowGameOver = newTriangles.every(t => t.completed);
        return {
            completedTriangle: triangleCompletedThisTurn,
            nowGameOver,
            updatedLines: newSelectedLines,
            updatedTriangles: newTriangles,
            updatedScores: newScores
        };
    }

    // New: Function to generate a unique hash for a game state
    function generateStateHash(linesState, scoresState) {
        return linesState.join('') + '_' + scoresState.join('');
    }

    // New: Function to clear transposition table when it gets too large
    function clearTranspositionTableIfNeeded() {
        if (transpositionTable.size > CACHE_CLEANUP_THRESHOLD) {
            // Keep only the most recent entries
            const entries = Array.from(transpositionTable.entries());
            const entriesToKeep = entries.slice(-CACHE_SIZE_LIMIT/2);
            transpositionTable.clear();
            entriesToKeep.forEach(([key, value]) => transpositionTable.set(key, value));
        }
    }

    // New: Score moves for better move ordering
    function scoreMoveForOrdering(lineId, linesState, trianglesState, player) {
        let score = 0;
        
        // Check if this move completes any triangles
        trianglesState.forEach(triangle => {
            if (!triangle.completed && triangle.lines.includes(lineId)) {
                const selectedCount = triangle.lines.filter(l => l !== lineId && linesState[l]).length;
                if (selectedCount === 2) {
                    score += 1000; // Heavily prioritize completing triangles
                } else if (selectedCount === 1) {
                    score += 100; // Prioritize moves that could lead to completions
                }
            }
        });
        
        return score;
    }

    // Modified: Optimized evaluation function
    function evaluateBoard(currentScores, currentTriangles) {
        // Base score from completed triangles
        let score = (currentScores[AI_PLAYER - 1] - currentScores[HUMAN_PLAYER - 1]) * 1000;
        
        // Early return for clearly winning/losing positions
        if (Math.abs(score) > 5000) return score;
        
        // Count potential triangles for each player
        currentTriangles.forEach(triangle => {
            if (!triangle.completed) {
                const selectedLineIdsInTriangle = triangle.lines.filter(lineId => selectedLines[lineId]);
                if (selectedLineIdsInTriangle.length === 2) {
                    const line1Owner = lines.find(l => l.id === selectedLineIdsInTriangle[0])?.player;
                    const line2Owner = lines.find(l => l.id === selectedLineIdsInTriangle[1])?.player;

                    if (line1Owner === AI_PLAYER && line2Owner === AI_PLAYER) {
                        score += 500; // Increased weight for near-completion
                    }
                    if (line1Owner === HUMAN_PLAYER && line2Owner === HUMAN_PLAYER) {
                        score -= 500; // Increased weight for blocking human
                    }
                } else if (selectedLineIdsInTriangle.length === 1) {
                    // Small bonus for having the first line in a triangle
                    const lineOwner = lines.find(l => l.id === selectedLineIdsInTriangle[0])?.player;
                    if (lineOwner === AI_PLAYER) score += 50;
                    if (lineOwner === HUMAN_PLAYER) score -= 50;
                }
            }
        });
        
        return score;
    }

    // Modified: findBestMoveAI with move ordering
    function findBestMoveAI(currentLinesState, currentTrianglesState, currentScoresState) {
        let bestScore = -Infinity;
        let bestLineId = null;
        let availableMoves = getAvailableLineMoves(currentLinesState);
        
        // Score and sort moves for better ordering
        availableMoves = availableMoves
            .map(moveId => ({
                moveId,
                score: scoreMoveForOrdering(moveId, currentLinesState, currentTrianglesState, AI_PLAYER)
            }))
            .sort((a, b) => b.score - a.score)
            .map(move => move.moveId);

        for (const lineId of availableMoves) {
            const { completedTriangle, nowGameOver, updatedScores, updatedTriangles: nextTriangles, updatedLines: nextLines } =
                simulateApplyMove(lineId, AI_PLAYER, currentLinesState, currentTrianglesState, currentScoresState);

            let currentMoveScore;
            if (nowGameOver) {
                currentMoveScore = evaluateBoard(updatedScores, nextTriangles);
            } else if (completedTriangle) {
                currentMoveScore = minimax(nextLines, nextTriangles, updatedScores, AI_MAX_DEPTH, -Infinity, Infinity, AI_PLAYER);
            } else {
                currentMoveScore = minimax(nextLines, nextTriangles, updatedScores, AI_MAX_DEPTH - 1, -Infinity, Infinity, HUMAN_PLAYER);
            }

            if (currentMoveScore > bestScore) {
                bestScore = currentMoveScore;
                bestLineId = lineId;
            }
            
            // Early cutoff for clearly winning moves
            if (bestScore > 5000) break;
        }
        
        return { lineId: bestLineId, score: bestScore };
    }

    // Modified: minimax with transposition table and enhanced pruning
    function minimax(linesState, trianglesState, scoresState, depth, alpha, beta, currentPlayerId) {
        // Early termination checks
        const isTerminal = trianglesState.every(t => t.completed);
        if (depth === 0 || isTerminal) {
            return evaluateBoard(scoresState, trianglesState);
        }

        // Check transposition table
        const stateHash = generateStateHash(linesState, scoresState);
        const cachedResult = transpositionTable.get(stateHash);
        if (cachedResult && cachedResult.depth >= depth) {
            return cachedResult.score;
        }

        const availableMoves = getAvailableLineMoves(linesState);
        if (availableMoves.length === 0) {
            return evaluateBoard(scoresState, trianglesState);
        }

        // Score and sort moves for better ordering
        const scoredMoves = availableMoves
            .map(moveId => ({
                moveId,
                score: scoreMoveForOrdering(moveId, linesState, trianglesState, currentPlayerId)
            }))
            .sort((a, b) => b.score - a.score)
            .map(move => move.moveId);

        let bestScore;
        if (currentPlayerId === AI_PLAYER) {
            bestScore = -Infinity;
            for (const lineId of scoredMoves) {
                const { completedTriangle, nowGameOver, updatedScores, updatedTriangles: nextTriangles, updatedLines: nextLines } =
                    simulateApplyMove(lineId, AI_PLAYER, linesState, trianglesState, scoresState);
                
                let evalScore;
                if (nowGameOver) {
                    evalScore = evaluateBoard(updatedScores, nextTriangles);
                } else if (completedTriangle) {
                    evalScore = minimax(nextLines, nextTriangles, updatedScores, depth, alpha, beta, AI_PLAYER);
                } else {
                    evalScore = minimax(nextLines, nextTriangles, updatedScores, depth - 1, alpha, beta, HUMAN_PLAYER);
                }
                
                bestScore = Math.max(bestScore, evalScore);
                alpha = Math.max(alpha, evalScore);
                
                // Enhanced pruning with clearly winning positions
                if (bestScore > 5000 || beta <= alpha) break;
            }
        } else {
            bestScore = Infinity;
            for (const lineId of scoredMoves) {
                const { completedTriangle, nowGameOver, updatedScores, updatedTriangles: nextTriangles, updatedLines: nextLines } =
                    simulateApplyMove(lineId, HUMAN_PLAYER, linesState, trianglesState, scoresState);

                let evalScore;
                if (nowGameOver) {
                    evalScore = evaluateBoard(updatedScores, nextTriangles);
                } else if (completedTriangle) {
                    evalScore = minimax(nextLines, nextTriangles, updatedScores, depth, alpha, beta, HUMAN_PLAYER);
                } else {
                    evalScore = minimax(nextLines, nextTriangles, updatedScores, depth - 1, alpha, beta, AI_PLAYER);
                }
                
                bestScore = Math.min(bestScore, evalScore);
                beta = Math.min(beta, evalScore);
                
                // Enhanced pruning with clearly losing positions
                if (bestScore < -5000 || beta <= alpha) break;
            }
        }

        // Store result in transposition table
        transpositionTable.set(stateHash, { score: bestScore, depth });
        clearTranspositionTableIfNeeded();
        
        return bestScore;
    }

    // Event listeners for buttons
    document.getElementById('restart-btn').addEventListener('click', initializeBoard);
    document.getElementById('play-again-btn').addEventListener('click', function() {
        document.getElementById('game-over').style.display = 'none';
        initializeBoard();
    });
    
    // Add listeners for board size and first player selection
    document.getElementById('boardSize').addEventListener('change', initializeBoard);
    document.getElementsByName('firstPlayer').forEach(radio => {
        radio.addEventListener('change', initializeBoard);
    });
    
    // Initialize the game
    initializeBoard();
});