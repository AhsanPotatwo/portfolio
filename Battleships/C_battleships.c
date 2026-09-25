#include <stdio.h> //stdio.h imports functions to help with input/output
#include <stdlib.h> //provides the function for random number generation
#include <time.h> //provides functions to help seed the random number generator

#define MAX_GRID_SIZE 10

// Function prototypes, at this point they don't contain any logic
// the function's purpose is just defined here with some basic information
void initializeGrid(char grid[MAX_GRID_SIZE][MAX_GRID_SIZE], int size);
void printGrid(char grid[MAX_GRID_SIZE][MAX_GRID_SIZE], int size, int revealShips);
void placeShips(char grid[MAX_GRID_SIZE][MAX_GRID_SIZE], int size, int numShips);
int getValidIntInput(const char *prompt, int min, int max);
int makeGuess(char grid[MAX_GRID_SIZE][MAX_GRID_SIZE], int size, int *shipsLeft);
void computerTurn(char playerGrid[MAX_GRID_SIZE][MAX_GRID_SIZE], int size, int *playerShipsLeft);

//this is the main game loop where the game takes place
int main() {
    srand(time(NULL)); // Seed the random number generator
    
//this takes input from the player for the board's size and the amount of 
//ships that will be on the board
    int gridSize = getValidIntInput("Enter the size of the board (1-10): ", 1, MAX_GRID_SIZE);
    int maxShips = gridSize * gridSize;
    int numShips = getValidIntInput("Enter the number of ships: ", 1, maxShips);

//intialises alot of the variables for the main game process
    char playerGrid[MAX_GRID_SIZE][MAX_GRID_SIZE];
    char computerGrid[MAX_GRID_SIZE][MAX_GRID_SIZE];

    initializeGrid(playerGrid, gridSize);
    initializeGrid(computerGrid, gridSize);

    placeShips(playerGrid, gridSize, numShips);
    placeShips(computerGrid, gridSize, numShips);

    int playerShipsLeft = numShips;
    int computerShipsLeft = numShips;

    printf("\nWelcome to Ahsan's Battleships!\n");

//the game keeps running until either one of the player
//has no ships left on the board
    while (playerShipsLeft > 0 && computerShipsLeft > 0) {
        // Display grids
        printf("\nYour Grid:\n");
        printGrid(playerGrid, gridSize, 1);
        printf("\nComputer's Grid:\n");
        printGrid(computerGrid, gridSize, 0);

        // Player's turn
        printf("\nYour turn!\n");
        computerShipsLeft -= makeGuess(computerGrid, gridSize, &computerShipsLeft);

        if (computerShipsLeft == 0) {
            printf("\nCongratulations! You sunk all the enemy ships. You win!\n");
            break;
        }

        // Computer's turn
        printf("\nComputer's turn!\n");
        computerTurn(playerGrid, gridSize, &playerShipsLeft);

        if (playerShipsLeft == 0) {
            printf("\nOh no! The computer sunk all your ships. You lose.\n");
            break;
        }
    }

    return 0;
}

//intialises the grid for the board to display the board for the game
void initializeGrid(char grid[MAX_GRID_SIZE][MAX_GRID_SIZE], int size) {
    for (int i = 0; i < size; i++) {
        for (int j = 0; j < size; j++) {
            grid[i][j] = '~';
        }
    }
}

//this displays the grid on the console
void printGrid(char grid[MAX_GRID_SIZE][MAX_GRID_SIZE], int size, int revealShips) {
    printf("  ");
    for (int i = 0; i < size; i++) {
        printf("%d ", i);
    }
    printf("\n");

    for (int i = 0; i < size; i++) {
        printf("%d ", i);
        for (int j = 0; j < size; j++) {
            if (grid[i][j] == 'S' && !revealShips) {
                printf("~ ");
            } else {
                printf("%c ", grid[i][j]);
            }
        }
        printf("\n");
    }
}

//this places the ships on the board randomly, it checks to see if the space is taken
//and if it isn't then the ship is placed
void placeShips(char grid[MAX_GRID_SIZE][MAX_GRID_SIZE], int size, int numShips) {
    int shipsPlaced = 0;
    while (shipsPlaced < numShips) {
        int x = rand() % size;
        int y = rand() % size;
        if (grid[x][y] == '~') {
            grid[x][y] = 'S';
            shipsPlaced++;
        }
    }
}

//this takes the player's input, it checks if the input is valid
//and within the maximum and minimum boundaries 
int getValidIntInput(const char *prompt, int min, int max) {
    int value;
    while (1) {
        printf("%s", prompt);
        if (scanf("%d", &value) == 1 && value >= min && value <= max) {
            break;
        } else {
            printf("Invalid input. Please enter a number between %d and %d.\n", min, max);
            while (getchar() != '\n'); // Clear invalid input
        }
    }
    return value;
}

//this takes the player's input and makes sure that the input is valid and makes sure
//that the player hasn't already guessed the spot before. It also has some validation
//to make sure that the input is valid
int makeGuess(char grid[MAX_GRID_SIZE][MAX_GRID_SIZE], int size, int *shipsLeft) {
    int x, y;
    while (1) {
        printf("Enter your guess (row and column, e.g., 2 3): ");
        if (scanf("%d %d", &x, &y) == 2 && x >= 0 && x < size && y >= 0 && y < size) {
            if (grid[x][y] == 'S') {
                grid[x][y] = 'X';
                (*shipsLeft)--;
                printf("Hit!\n");
                return 1;
            } else if (grid[x][y] == '~') {
                grid[x][y] = 'O';
                printf("Miss.\n");
                return 0;
            } else {
                printf("You already guessed that spot. Try again.\n");
            }
        } else {
            printf("Invalid input. Please enter two numbers within the grid range.\n");
            while (getchar() != '\n'); // Clear invalid input
        }
    }
}

//this is the cmoputer's guess. The computer guesses randomly and it tries to make sure
//that the computer hasn't already made the guess
void computerTurn(char playerGrid[MAX_GRID_SIZE][MAX_GRID_SIZE], int size, int *playerShipsLeft) {
    int x, y;
    while (1) {
        x = rand() % size;
        y = rand() % size;
        if (playerGrid[x][y] == 'S') {
            playerGrid[x][y] = 'X';
            (*playerShipsLeft)--;
            printf("The computer hit one of your ships at (%d, %d)!\n", x, y);
            return;
        } else if (playerGrid[x][y] == '~') {
            playerGrid[x][y] = 'O';
            printf("The computer missed at (%d, %d).\n", x, y);
            return;
        }
    }
}
