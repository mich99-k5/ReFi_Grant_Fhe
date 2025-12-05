# ReFi Grant FHE: Empowering Public Goods through Privacy

ReFi Grant FHE is an innovative ReFi protocol that leverages **Zama's Fully Homomorphic Encryption technology** to facilitate the issuance of encrypted grants for public goods by DAOs. By ensuring both donors and project applicants remain anonymous, this platform revolutionizes the way funding for public projects is approached, promoting fairness and transparency without compromising privacy.

## The Challenge of Funding Public Goods

In the current landscape of public goods financing, the identities of both funders and project proposers can lead to issues such as collusion and biased funding allocations. Existing systems can be vulnerable to manipulation, making it difficult to ensure that resources are distributed equitably among various initiatives. The need for a solution that maintains participant privacy while enabling effective and fair funding is more critical than ever.

## How FHE by Zama Addresses These Challenges

Fully Homomorphic Encryption (FHE) provides a groundbreaking approach to solving the privacy and transparency challenges in public goods funding. By utilizing **Zama's open-source libraries** like **Concrete** and **TFHE-rs**, ReFi Grant FHE enables fully encrypted transactions throughout the funding process. This means that sensitive data can be computed on while encrypted, ensuring that funders and applicants can interact without revealing their identities.

### Key Features of ReFi Grant FHE

- **FHE-Encrypted Interaction**: Both donations and applications are fully encrypted, ensuring privacy for all participants.
- **Second-Degree Matching Algorithm**: Using homomorphic computation on encrypted data, we prevent collusion and witch-hunting attacks, leading to fairer public goods funding.
- **Empowerment through Privacy**: Participants can engage without fear of exposing their identities, fostering a more inclusive ecosystem for public funding.
- **DAO Governance Integration**: The platform serves as a vital infrastructure for ReFi governance, enabling decentralized decision-making in funding allocations.

## Technology Stack

- **Zama's FHE SDK**: This is the cornerstone of our confidential computing solution.
- **Node.js**: For server-side JavaScript execution.
- **Hardhat**: For Ethereum development, providing a robust environment for smart contract deployment and testing.
- **Solidity**: The programming language for writing smart contracts.

## Project Structure

Here’s a quick glance at the directory structure of the ReFi Grant FHE project:

```
/ReFi_Grant_Fhe
├── contracts
│   ├── ReFi_Grant_Fhe.sol
├── scripts
│   ├── deploy.js
├── src
│   ├── index.js
├── tests
│   ├── test_ReFi_Grant_Fhe.js
├── package.json
└── hardhat.config.js
```

## Setup Instructions

To set up the ReFi Grant FHE project, follow these steps:

1. **Prerequisites**: Ensure you have Node.js and Hardhat installed on your machine.
2. **Download the Project**: Obtain the project files using your preferred method (ensure you do not use `git clone`).
3. **Install Dependencies**: Navigate to the project directory and run the following command to install the necessary libraries, including Zama FHE libraries:

   ```bash
   npm install
   ```

This will set up all the required dependencies, including the Zama FHE SDK needed for encrypted computations.

## Building and Running the Project

After setting up the project, you can compile, test, and run it using the following commands:

1. **Compile the Contracts**:
   ```bash
   npx hardhat compile
   ```

2. **Run Tests**:
   ```bash
   npx hardhat test
   ```

3. **Deploy the Contracts**:
   ```bash
   npx hardhat run scripts/deploy.js
   ```

### Code Example: Grant Application Submission

Here’s a snippet illustrating how a project applicant can submit an encrypted grant application:

```javascript
const { encryptApplication } = require("./encryptUtils");

async function submitApplication(applicantData) {
    const encryptedData = await encryptApplication(applicantData);
    const tx = await contract.submitGrantApplication(encryptedData);
    
    await tx.wait();
    console.log("Grant application submitted successfully!");
}

// Sample applicant data
const applicant = {
    name: "Project Phoenix",
    description: "A public initiative to improve community gardens."
};

submitApplication(applicant);
```

## Acknowledgements

### Powered by Zama

We extend our heartfelt gratitude to the Zama team for their pioneering work in Fully Homomorphic Encryption and their open-source tools that make confidential blockchain applications possible. Their contributions empower us to create solutions that ensure privacy and fairness in public goods financing.

---

By harnessing the power of Zama's FHE technology, ReFi Grant FHE stands at the forefront of a new way to fund public goods, ensuring that privacy and equity go hand in hand. Join us in creating a future where everyone has the opportunity to contribute to and benefit from public initiatives!
