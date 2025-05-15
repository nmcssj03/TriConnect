document.addEventListener('DOMContentLoaded', function() {
    // Game constants
    const BOARD_WIDTH = 600;
    const NODE_RADIUS = 6;
    const HORIZONTAL_SPACING = 92;
    const VERTICAL_SPACING = 75;
    
    // Game state
    let currentNumLayers = 6;
    let firstToPlay = 1;
    let currentPlayer;
    let scores = [0, 0];
    let selectedLines = [];
    let triangles = [];
    let gameFinished = false;
    
    // SVG element
    const svg = document.getElementById('board-svg');
    
    // Calculate node positions for the pyramid
    function calculateNodePositions() {
        const nodes = [];
        let totalNodes = 0;
        
        for (let layer = 1; layer <= currentNumLayers; layer++) {
            const layerWidth = layer * HORIZONTAL_SPACING;
            const startX = (BOARD_WIDTH - layerWidth) / 2 + HORIZONTAL_SPACING / 2;
            
            for (let i = 0; i < layer; i++) {
                const x = startX + i * HORIZONTAL_SPACING;
                const y = layer * VERTICAL_SPACING;
                nodes.push({
                    id: totalNodes++,
                    x,
                    y,
                    layer
                });
            }
        }
        
        return nodes;
    }
    
    // Generate all possible lines that connect nodes
    function generateLines(nodes) {
        const lines = [];
        let lineId = 0;
        
        // Helper function to find a node by coordinates
        function findNodeByCoords(x, y) {
            return nodes.find(node => Math.abs(node.x - x) < 0.001 && Math.abs(node.y - y) < 0.001);
        }
        
        // Generate horizontal lines
        for (let layer = 1; layer <= currentNumLayers; layer++) {
            const layerNodes = nodes.filter(node => node.layer === layer);
            
            for (let i = 0; i < layerNodes.length - 1; i++) {
                lines.push({
                    id: lineId++,
                    node1: layerNodes[i].id,
                    node2: layerNodes[i + 1].id,
                    type: 'horizontal',
                    selected: false,
                    player: null
                });
            }
        }
        
        // Generate diagonal lines (right-leaning and left-leaning)
        for (let layer = 1; layer < currentNumLayers; layer++) {
            const currentLayerNodes = nodes.filter(node => node.layer === layer);
            // const nextLayerNodes = nodes.filter(node => node.layer === layer + 1);
            
            for (let i = 0; i < currentLayerNodes.length; i++) {
                const currentNode = currentLayerNodes[i];
                
                // Right diagonal
                const rightTarget = {
                    x: currentNode.x + HORIZONTAL_SPACING / 2,
                    y: currentNode.y + VERTICAL_SPACING
                };
                const rightNode = findNodeByCoords(rightTarget.x, rightTarget.y);
                
                if (rightNode) {
                    lines.push({
                        id: lineId++,
                        node1: currentNode.id,
                        node2: rightNode.id,
                        type: 'right-diagonal',
                        selected: false,
                        player: null
                    });
                }
                
                // Left diagonal
                const leftTarget = {
                    x: currentNode.x - HORIZONTAL_SPACING / 2,
                    y: currentNode.y + VERTICAL_SPACING
                };
                const leftNode = findNodeByCoords(leftTarget.x, leftTarget.y);
                
                if (leftNode) {
                    lines.push({
                        id: lineId++,
                        node1: currentNode.id,
                        node2: leftNode.id,
                        type: 'left-diagonal',
                        selected: false,
                        player: null
                    });
                }
            }
        }
        
        return lines;
    }
    
    // Generate all possible triangles in the board
    function generateTriangles(nodes, lines) {
        const triangles = [];
        let triangleId = 0;
        
        // Helper function to find a line between two nodes
        function findLine(node1Id, node2Id) {
            return lines.find(line => 
                (line.node1 === node1Id && line.node2 === node2Id) || 
                (line.node1 === node2Id && line.node2 === node1Id)
            );
        }
        
        // Check all possible combinations of 3 nodes
        for (let i = 0; i < nodes.length; i++) {
            for (let j = i + 1; j < nodes.length; j++) {
                for (let k = j + 1; k < nodes.length; k++) {
                    const node1 = nodes[i];
                    const node2 = nodes[j];
                    const node3 = nodes[k];
                    
                    // Check if lines exist between all three nodes
                    const line1 = findLine(node1.id, node2.id);
                    const line2 = findLine(node2.id, node3.id);
                    const line3 = findLine(node3.id, node1.id);
                    
                    if (line1 && line2 && line3) {
                        // Calculate triangle orientation (up or down)
                        const orientation = (node1.layer + node2.layer + node3.layer) % 3 === 0 ? 'up' : 'down';
                        
                        triangles.push({
                            id: triangleId++,
                            nodes: [node1.id, node2.id, node3.id],
                            lines: [line1.id, line2.id, line3.id],
                            completed: false,
                            player: null,
                            orientation
                        });
                    }
                }
            }
        }
        
        return triangles;
    }
    
    // Initialize the game board
    function initializeBoard() {
        // Clear the SVG
        svg.innerHTML = '';
        
        // Calculate nodes and lines
        const nodes = calculateNodePositions();
        const lines = generateLines(nodes);
        triangles = generateTriangles(nodes, lines);
        selectedLines = new Array(lines.length).fill(false);
        
        // Create triangle elements (behind the lines)
        const triangleGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        triangleGroup.setAttribute('class', 'triangles');
        
        triangles.forEach(triangle => {
            const node1 = nodes[triangle.nodes[0]];
            const node2 = nodes[triangle.nodes[1]];
            const node3 = nodes[triangle.nodes[2]];
            
            const triangleElement = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
            triangleElement.setAttribute('points', `${node1.x},${node1.y} ${node2.x},${node2.y} ${node3.x},${node3.y}`);
            triangleElement.setAttribute('class', 'triangle');
            triangleElement.setAttribute('id', `triangle-${triangle.id}`);
            triangleElement.setAttribute('opacity', '0');
            triangleGroup.appendChild(triangleElement);
        });
        
        svg.appendChild(triangleGroup);
        
        // Create line elements
        const lineGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        lineGroup.setAttribute('class', 'lines');
        
        lines.forEach(line => {
            const node1 = nodes[line.node1];
            const node2 = nodes[line.node2];
            
            const lineElement = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            lineElement.setAttribute('x1', node1.x);
            lineElement.setAttribute('y1', node1.y);
            lineElement.setAttribute('x2', node2.x);
            lineElement.setAttribute('y2', node2.y);
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
        currentPlayer = firstToPlay;
        scores = [0, 0];
        gameFinished = false;
        
        // Update UI
        updateScoreDisplay();
        updatePlayerTurn();
        gameOverElement.style.display = 'none';
    }
    
    // Handle line click event
    function handleLineClick(lineId) {
        if (gameFinished) return;
        
        // Check if line is already selected
        if (selectedLines[lineId]) return;
        
        // Mark line as selected for the current player
        selectedLines[lineId] = true;
        const lineElement = document.getElementById(`line-${lineId}`);
        lineElement.classList.add('selected');
        lineElement.classList.add(`player-${currentPlayer}`);
        
        // Check if any triangles are completed
        let triangleCompleted = false;
        
        triangles.forEach(triangle => {
            if (!triangle.completed && triangle.lines.every(lineId => selectedLines[lineId])) {
                triangle.completed = true;
                triangle.player = currentPlayer;
                scores[currentPlayer - 1]++;
                triangleCompleted = true;
                
                // Update triangle display
                const triangleElement = document.getElementById(`triangle-${triangle.id}`);
                triangleElement.classList.add(`player-${currentPlayer}`);
                triangleElement.setAttribute('opacity', '0.5');
            }
        });
        
        // Check if all triangles are completed
        const allTrianglesCompleted = triangles.every(triangle => triangle.completed);
        
        if (allTrianglesCompleted) {
            gameFinished = true;
            showGameOver();
        }
        
        // Update player turn if no triangle was completed
        if (!triangleCompleted) {
            switchPlayer();
        } else {
            updateScoreDisplay();
        }
    }
    
    // Switch to the next player
    function switchPlayer() {
        currentPlayer = currentPlayer === 1 ? 2 : 1;
        updatePlayerTurn();
    }
    
    // Update score display
    function updateScoreDisplay() {
        document.getElementById('score1').textContent = scores[0];
        document.getElementById('score2').textContent = scores[1];
    }
    
    // Update player turn indication
    function updatePlayerTurn() {
        document.getElementById('player1').classList.toggle('active', currentPlayer === 1);
        document.getElementById('player2').classList.toggle('active', currentPlayer === 2);
    }
    
    // Show game over screen
    function showGameOver() {
        const winnerTextElement = document.getElementById('winner-text');
        
        if (scores[0] > scores[1]) {
            winnerTextElement.innerHTML = 'Player <span class="player-1-text">1 (Blue)</span> wins!';
        } else if (scores[1] > scores[0]) {
            winnerTextElement.innerHTML = 'Player <span class="player-2-text">2 (Red)</span> wins!';
        } else {
            winnerTextElement.textContent = 'It\'s a tie!';
        }
        
        gameOverElement.style.display = 'block';
    }
    
    // Event listeners for buttons
    const gameOverElement = document.getElementById('game-over');
    document.getElementById('restart-btn').addEventListener('click', initializeBoard);
    document.getElementById('play-again-btn').addEventListener('click', () => {
        gameOverElement.style.display = 'none';
        initializeBoard();
    });
    document.getElementById('boardSize').addEventListener('change', function() {
        currentNumLayers = Number(this.value);
        initializeBoard();
    });
    document.getElementById('firstToPlay').addEventListener('change', (e) => {
        if (e.target.name === 'firstPlayer' && e.target.type === 'radio') {
            firstToPlay = Number(e.target.value);
            initializeBoard();
        }
    }); 
    
    // Initialize the game
    initializeBoard();
});